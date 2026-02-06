import { Inject, Injectable } from '@nestjs/common';
import {
  OBSERVABILITY_ADAPTER,
  type ObservabilityAdapter,
} from '@/infra/observability/observability.adapter';
import {
  type FormAnswerBatchItem,
  type JobRunCursor,
  type LeadSearchProfileUpsertPayload,
  NORMALIZE_LEAD_SEARCH_PROFILE_PORT,
  type NormalizeLeadSearchProfilePort,
} from '@/modules/leads/application/ports/normalize-lead-search-profile.port';
import {
  createUnknownNormalizationCounts,
  normalizeCompanySize,
  normalizeEducationLevel,
  normalizeGender,
  PROFILE_FIELD_TO_QUESTION_KEYS,
  parseAgeRange,
  parseSalaryRange,
  type UnknownNormalizationCounts,
  withUnknownValueCount,
} from '@/modules/leads/domain/normalization';

const JOB_NAME = 'normalize-lead-search-profile';

export interface NormalizeLeadSearchProfileInput {
  batchSize: number;
  dryRun?: boolean;
  metadata?: Record<string, unknown>;
  jobName?: string;
  allowConcurrentRun?: boolean;
}

export interface NormalizeLeadSearchProfileResult {
  jobRunId: string | null;
  resumedFromJobRunId: string | null;
  processedRows: number;
  processedLeads: number;
  cursor: JobRunCursor | null;
  skipped: boolean;
}

@Injectable()
export class NormalizeLeadSearchProfileUseCase {
  constructor(
    @Inject(NORMALIZE_LEAD_SEARCH_PROFILE_PORT)
    private readonly port: NormalizeLeadSearchProfilePort,
    @Inject(OBSERVABILITY_ADAPTER)
    private readonly observability: ObservabilityAdapter,
  ) {}

  async execute(input: NormalizeLeadSearchProfileInput): Promise<NormalizeLeadSearchProfileResult> {
    const batchSize = Math.max(1, Math.floor(input.batchSize));
    const jobName = input.jobName?.trim() || JOB_NAME;
    const dryRun = input.dryRun ?? false;

    if (!input.allowConcurrentRun) {
      const hasRunningJob = await this.port.hasRunningJobRun(jobName);
      if (hasRunningJob) {
        this.observability.warn('normalize_lead_search_profile_skipped_running_job', {
          jobRunId: null,
          step: 'start',
          batchSize,
          cursorCreatedAt: null,
          cursorId: null,
          processedRows: 0,
          processedLeads: 0,
          unknownEducationCount: 0,
          jobName,
        });

        return {
          jobRunId: null,
          resumedFromJobRunId: null,
          processedRows: 0,
          processedLeads: 0,
          cursor: null,
          skipped: true,
        };
      }
    }

    const resumeFrom = await this.resolveResumeRun(jobName);
    const baseCursor = resumeFrom?.cursor ?? null;

    let run: Awaited<ReturnType<NormalizeLeadSearchProfilePort['createJobRun']>>;
    try {
      run = await this.port.createJobRun({
        jobName,
        status: 'running',
        cursor: baseCursor,
        processedRows: resumeFrom?.processedRows ?? 0,
        processedLeads: resumeFrom?.processedLeads ?? 0,
        meta: {
          dryRun,
          resumedFromJobRunId: resumeFrom?.id ?? null,
          ...(input.metadata ?? {}),
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('lock lógico ativo')) {
        this.observability.warn('normalize_lead_search_profile_skipped_lock', {
          jobRunId: null,
          step: 'start',
          batchSize,
          cursorCreatedAt: null,
          cursorId: null,
          processedRows: 0,
          processedLeads: 0,
          unknownEducationCount: 0,
          jobName,
        });
        return {
          jobRunId: null,
          resumedFromJobRunId: null,
          processedRows: 0,
          processedLeads: 0,
          cursor: null,
          skipped: true,
        };
      }

      throw error;
    }

    let cursor = run.cursor;
    let processedRows = run.processedRows;
    let processedLeads = run.processedLeads;
    let unknownNormalizationCounts = createUnknownNormalizationCounts();

    this.observability.info('normalize_lead_search_profile_started', {
      jobRunId: run.id,
      step: 'start',
      batchSize,
      cursorCreatedAt: cursor?.createdAt ?? null,
      cursorId: cursor?.id ?? null,
      processedRows,
      processedLeads,
      unknownEducationCount: this.getUnknownEducationCount(unknownNormalizationCounts),
      resumedFromJobRunId: resumeFrom?.id ?? null,
      dryRun,
    });

    try {
      const questionIdToField = await this.resolveQuestionIdToFieldMap();
      const questionIds = [...questionIdToField.keys()];
      if (questionIds.length === 0) {
        await this.port.markJobRunCompleted({
          id: run.id,
          cursor,
          processedRows,
          processedLeads,
          meta: { reason: 'no_questions_found' },
        });

        this.observability.info('normalize_lead_search_profile_completed', {
          jobRunId: run.id,
          step: 'complete',
          batchSize,
          cursorCreatedAt: cursor?.createdAt ?? null,
          cursorId: cursor?.id ?? null,
          processedRows,
          processedLeads,
          unknownEducationCount: this.getUnknownEducationCount(unknownNormalizationCounts),
          reason: 'no_questions_found',
        });

        return {
          jobRunId: run.id,
          resumedFromJobRunId: resumeFrom?.id ?? null,
          processedRows,
          processedLeads,
          cursor,
          skipped: false,
        };
      }

      for (;;) {
        const batch = await this.port.readFormAnswersBatch({
          questionIds,
          cursor,
          limit: batchSize,
        });

        if (batch.length === 0) break;

        const parsed = this.buildProfileBatch(batch, questionIdToField, unknownNormalizationCounts);
        const payload = parsed.payload;
        unknownNormalizationCounts = parsed.unknownNormalizationCounts;

        if (!dryRun && payload.length > 0) {
          await this.port.upsertLeadSearchProfile(payload);
        }

        const last = batch[batch.length - 1];
        cursor = {
          createdAt: last.createdAt,
          id: last.id,
        };
        processedRows += batch.length;
        processedLeads += payload.length;

        await this.port.updateJobRunProgress({
          id: run.id,
          cursor,
          processedRows,
          processedLeads,
        });

        this.observability.info('normalize_lead_search_profile_progress', {
          jobRunId: run.id,
          step: 'batch_progress',
          batchSize,
          cursorCreatedAt: cursor.createdAt,
          cursorId: cursor.id,
          processedRows,
          processedLeads,
          unknownEducationCount: this.getUnknownEducationCount(unknownNormalizationCounts),
          batchRows: batch.length,
          batchLeads: payload.length,
        });
      }

      await this.port.markJobRunCompleted({
        id: run.id,
        cursor,
        processedRows,
        processedLeads,
      });

      this.observability.info('normalize_lead_search_profile_completed', {
        jobRunId: run.id,
        step: 'complete',
        batchSize,
        cursorCreatedAt: cursor?.createdAt ?? null,
        cursorId: cursor?.id ?? null,
        processedRows,
        processedLeads,
        unknownEducationCount: this.getUnknownEducationCount(unknownNormalizationCounts),
      });

      return {
        jobRunId: run.id,
        resumedFromJobRunId: resumeFrom?.id ?? null,
        processedRows,
        processedLeads,
        cursor,
        skipped: false,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unexpected normalization error';

      await this.port.markJobRunFailed({
        id: run.id,
        cursor,
        processedRows,
        processedLeads,
        errorMessage,
      });

      this.observability.error(
        'normalize_lead_search_profile_failed',
        {
          jobRunId: run.id,
          step: 'failed',
          batchSize,
          cursorCreatedAt: cursor?.createdAt ?? null,
          cursorId: cursor?.id ?? null,
          processedRows,
          processedLeads,
          unknownEducationCount: this.getUnknownEducationCount(unknownNormalizationCounts),
          errorMessage,
        },
        error,
      );
      throw error;
    }
  }

  private async resolveResumeRun(jobName: string) {
    const runningOrFailed = await this.port.findLatestJobRunByStatuses({
      jobName,
      statuses: ['running', 'failed'],
    });

    if (runningOrFailed) return runningOrFailed;

    return this.port.findLatestJobRunByStatuses({
      jobName,
      statuses: ['completed'],
    });
  }

  private async resolveQuestionIdToFieldMap(): Promise<
    Map<string, keyof LeadSearchProfileUpsertPayload>
  > {
    const allKeys = [...new Set(Object.values(PROFILE_FIELD_TO_QUESTION_KEYS).flat())];
    const resolved = await this.port.resolveQuestionIdsByNormalizedKeys(allKeys);
    const mapping = new Map<string, keyof LeadSearchProfileUpsertPayload>();

    for (const [field, keys] of Object.entries(PROFILE_FIELD_TO_QUESTION_KEYS)) {
      for (const key of keys) {
        const questionIds = resolved[key] ?? [];
        for (const questionId of questionIds) {
          mapping.set(questionId, field as keyof LeadSearchProfileUpsertPayload);
        }
      }
    }

    return mapping;
  }

  private buildProfileBatch(
    batch: FormAnswerBatchItem[],
    questionIdToField: Map<string, keyof LeadSearchProfileUpsertPayload>,
    unknownNormalizationCounts: UnknownNormalizationCounts,
  ): {
    payload: LeadSearchProfileUpsertPayload[];
    unknownNormalizationCounts: UnknownNormalizationCounts;
  } {
    const updates = new Map<string, LeadSearchProfileUpsertPayload>();
    let updatedUnknownCounts = unknownNormalizationCounts;

    for (const answer of batch) {
      if (!answer.leadId) continue;
      const field = questionIdToField.get(answer.questionId);
      if (!field) continue;

      const current = updates.get(answer.leadId) ?? { leadId: answer.leadId };
      const parsed = this.parseFieldValue(field, answer, updatedUnknownCounts);
      current[field] = parsed.value as never;
      updatedUnknownCounts = parsed.unknownNormalizationCounts;
      updates.set(answer.leadId, current);
    }

    return {
      payload: [...updates.values()],
      unknownNormalizationCounts: updatedUnknownCounts,
    };
  }

  private getUnknownEducationCount(counts: UnknownNormalizationCounts): number {
    return Object.values(counts.educationLevel).reduce((acc, value) => acc + value, 0);
  }

  private parseFieldValue(
    field: keyof LeadSearchProfileUpsertPayload,
    answer: FormAnswerBatchItem,
    unknownNormalizationCounts: UnknownNormalizationCounts,
  ): {
    value: string | number | null;
    unknownNormalizationCounts: UnknownNormalizationCounts;
  } {
    if (typeof answer.valueNumber === 'number' && Number.isFinite(answer.valueNumber)) {
      return { value: answer.valueNumber, unknownNormalizationCounts };
    }

    if (field === 'salaryMin' || field === 'salaryMax') {
      const range = parseSalaryRange(answer.valueText);
      return {
        value: field === 'salaryMin' ? range.salary_min : range.salary_max,
        unknownNormalizationCounts,
      };
    }

    if (field === 'ageMin' || field === 'ageMax') {
      const range = parseAgeRange(answer.valueText);
      return {
        value: field === 'ageMin' ? range.age_min : range.age_max,
        unknownNormalizationCounts,
      };
    }

    if (field === 'gender') {
      const normalized = normalizeGender(answer.valueText);
      return {
        value: normalized,
        unknownNormalizationCounts: withUnknownValueCount({
          counts: unknownNormalizationCounts,
          field: 'gender',
          rawValue: answer.valueText,
          normalizedValue: normalized,
        }),
      };
    }

    if (field === 'companySize') {
      const normalized = normalizeCompanySize(answer.valueText);
      return {
        value: normalized,
        unknownNormalizationCounts: withUnknownValueCount({
          counts: unknownNormalizationCounts,
          field: 'companySize',
          rawValue: answer.valueText,
          normalizedValue: normalized,
        }),
      };
    }

    if (field === 'educationLevel') {
      const normalized = normalizeEducationLevel(answer.valueText);
      return {
        value: normalized,
        unknownNormalizationCounts: withUnknownValueCount({
          counts: unknownNormalizationCounts,
          field: 'educationLevel',
          rawValue: answer.valueText,
          normalizedValue: normalized,
        }),
      };
    }

    return { value: null, unknownNormalizationCounts };
  }
}
