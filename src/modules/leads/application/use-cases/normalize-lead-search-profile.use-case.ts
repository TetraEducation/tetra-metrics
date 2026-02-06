import { Inject, Injectable, Logger } from '@nestjs/common';
import { normalizeText } from '@/modules/imports/application/utils/normalize';
import {
  type FormAnswerBatchItem,
  type JobRunCursor,
  type LeadSearchProfileUpsertPayload,
  NORMALIZE_LEAD_SEARCH_PROFILE_PORT,
  type NormalizeLeadSearchProfilePort,
} from '@/modules/leads/application/ports/normalize-lead-search-profile.port';

const JOB_NAME = 'normalize-lead-search-profile';

const PROFILE_KEY_TO_QUESTION_KEYS: Record<string, string[]> = {
  salaryMin: ['salary-min', 'salary-minimum', 'salario-minimo', 'pretensao-salarial-minima'],
  salaryMax: ['salary-max', 'salary-maximum', 'salario-maximo', 'pretensao-salarial-maxima'],
  ageMin: ['age-min', 'idade-minima'],
  ageMax: ['age-max', 'idade-maxima'],
  gender: ['gender', 'genero', 'sexo'],
  companySize: ['company-size', 'company-porte', 'porte-empresa', 'porte'],
  educationLevel: ['education-level', 'schooling', 'escolaridade'],
};

export interface NormalizeLeadSearchProfileInput {
  batchSize: number;
  dryRun?: boolean;
  metadata?: Record<string, unknown>;
  jobName?: string;
}

export interface NormalizeLeadSearchProfileResult {
  jobRunId: string;
  resumedFromJobRunId: string | null;
  processedRows: number;
  processedLeads: number;
  cursor: JobRunCursor | null;
}

@Injectable()
export class NormalizeLeadSearchProfileUseCase {
  private readonly logger = new Logger(NormalizeLeadSearchProfileUseCase.name);

  constructor(
    @Inject(NORMALIZE_LEAD_SEARCH_PROFILE_PORT)
    private readonly port: NormalizeLeadSearchProfilePort,
  ) {}

  async execute(input: NormalizeLeadSearchProfileInput): Promise<NormalizeLeadSearchProfileResult> {
    const batchSize = Math.max(1, Math.floor(input.batchSize));
    const jobName = input.jobName?.trim() || JOB_NAME;
    const dryRun = input.dryRun ?? false;

    const resumeFrom = await this.resolveResumeRun(jobName);
    const baseCursor = resumeFrom?.cursor ?? null;

    const run = await this.port.createJobRun({
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

    let cursor = run.cursor;
    let processedRows = run.processedRows;
    let processedLeads = run.processedLeads;

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

        return {
          jobRunId: run.id,
          resumedFromJobRunId: resumeFrom?.id ?? null,
          processedRows,
          processedLeads,
          cursor,
        };
      }

      for (;;) {
        const batch = await this.port.readFormAnswersBatch({
          questionIds,
          cursor,
          limit: batchSize,
        });

        if (batch.length === 0) break;

        const payload = this.buildProfileBatch(batch, questionIdToField);

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
      }

      await this.port.markJobRunCompleted({
        id: run.id,
        cursor,
        processedRows,
        processedLeads,
      });

      return {
        jobRunId: run.id,
        resumedFromJobRunId: resumeFrom?.id ?? null,
        processedRows,
        processedLeads,
        cursor,
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

      this.logger.error(`Falha ao normalizar lead_search_profile: ${errorMessage}`, error);
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
    const allKeys = [...new Set(Object.values(PROFILE_KEY_TO_QUESTION_KEYS).flat())];
    const resolved = await this.port.resolveQuestionIdsByNormalizedKeys(allKeys);
    const mapping = new Map<string, keyof LeadSearchProfileUpsertPayload>();

    for (const [field, keys] of Object.entries(PROFILE_KEY_TO_QUESTION_KEYS)) {
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
  ): LeadSearchProfileUpsertPayload[] {
    const updates = new Map<string, LeadSearchProfileUpsertPayload>();

    for (const answer of batch) {
      if (!answer.leadId) continue;
      const field = questionIdToField.get(answer.questionId);
      if (!field) continue;

      const current = updates.get(answer.leadId) ?? { leadId: answer.leadId };
      const value = this.parseFieldValue(field, answer);
      current[field] = value as never;
      updates.set(answer.leadId, current);
    }

    return [...updates.values()];
  }

  private parseFieldValue(
    field: keyof LeadSearchProfileUpsertPayload,
    answer: FormAnswerBatchItem,
  ): string | number | null {
    if (
      field === 'salaryMin' ||
      field === 'salaryMax' ||
      field === 'ageMin' ||
      field === 'ageMax'
    ) {
      if (typeof answer.valueNumber === 'number' && Number.isFinite(answer.valueNumber)) {
        return answer.valueNumber;
      }

      const source = answer.valueText?.replace(',', '.')?.trim();
      if (!source) return null;
      const parsed = Number(source.replace(/[^0-9.-]/g, ''));
      return Number.isFinite(parsed) ? parsed : null;
    }

    const normalized = normalizeText(answer.valueText ?? '');
    return normalized || null;
  }
}
