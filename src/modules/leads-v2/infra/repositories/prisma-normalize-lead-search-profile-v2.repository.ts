import { Inject, Injectable } from '@nestjs/common';
import { PRISMA_V2 } from '@/infra/prisma-v2/prisma-v2.provider';
import type {
  FormAnswerBatchItem,
  JobRunCursor,
  JobRunSnapshot,
  JobRunStatus,
  LeadSearchProfileUpsertPayload,
  NormalizeLeadSearchProfilePort,
} from '@/modules/leads/application/ports/normalize-lead-search-profile.port';
import { LEADS_V2_SEARCH_PROFILE_REPOSITORY } from '@/modules/leads-v2/application/ports/leads-v2-search-profile.port';
import type { LeadsV2SearchProfileRepositoryPort } from '@/modules/leads-v2/application/ports/leads-v2-search-profile.port';

const JOB_FILE_NAME = 'normalize-lead-search-profile-v2';
const JOB_FILE_PATH = 'system://lead-search-profile-v2';
const JOB_TAG_KEY = 'normalize-lead-search-profile-v2';

type PrismaDecimal = { toNumber: () => number };
type PrismaJobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

type JobRunRow = {
  id: string;
  jobName: string;
  status: PrismaJobStatus;
  processedRows: number;
  processedOk: number;
  meta: Record<string, unknown> | null;
  updatedAt?: Date;
};

type PrismaV2Client = {
  formQuestions: {
    findMany: (args: {
      where: { keyNormalized: { in: string[] } };
      select: { id: true; keyNormalized: true };
    }) => Promise<Array<{ id: string; keyNormalized: string }>>;
  };
  formAnswers: {
    findMany: (args: {
      where: {
        questionId: { in: string[] };
        OR?: Array<
          | { createdAt: { gt: Date } }
          | {
              createdAt: Date;
              id: { gt: string };
            }
        >;
      };
      orderBy: Array<{ createdAt: 'asc' } | { id: 'asc' }>;
      take: number;
      select: {
        id: true;
        questionId: true;
        createdAt: true;
        valueText: true;
        valueNumber: true;
        submission: {
          select: {
            leadId: true;
          };
        };
      };
    }) => Promise<
      Array<{
        id: string;
        questionId: string;
        createdAt: Date;
        valueText: string | null;
        valueNumber: PrismaDecimal | number | null;
        submission: {
          leadId: string | null;
        };
      }>
    >;
  };
  jobRuns: {
    findFirst: (args: {
      where: {
        jobName: string;
        status?: PrismaJobStatus | { in: PrismaJobStatus[] };
      };
      orderBy: { createdAt: 'desc' };
    }) => Promise<JobRunRow | null>;
    count: (args: {
      where: { jobName: string; status: PrismaJobStatus };
    }) => Promise<number>;
    create: (args: {
      data: {
        jobName: string;
        status: PrismaJobStatus;
        fileName: string;
        filePath: string;
        fileHash: string;
        sourceSystem: 'FORM';
        tagKey: string;
        processedRows: number;
        processedOk: number;
        processedErrors: number;
        meta: Record<string, unknown>;
        startedAt: Date;
      };
    }) => Promise<JobRunRow>;
    update: (args: {
      where: { id: string };
      data: {
        status?: PrismaJobStatus;
        processedRows?: number;
        processedOk?: number;
        errorMessage?: string | null;
        finishedAt?: Date;
        meta?: Record<string, unknown>;
        updatedAt: Date;
      };
    }) => Promise<unknown>;
    updateMany: (args: {
      where: {
        jobName: string;
        status: PrismaJobStatus;
        updatedAt: { lt: Date };
      };
      data: {
        status: PrismaJobStatus;
        errorMessage: string;
        finishedAt: Date;
        updatedAt: Date;
      };
    }) => Promise<{ count: number }>;
  };
};

@Injectable()
export class PrismaNormalizeLeadSearchProfileV2Repository implements NormalizeLeadSearchProfilePort {
  constructor(
    @Inject(PRISMA_V2) private readonly prisma: PrismaV2Client,
    @Inject(LEADS_V2_SEARCH_PROFILE_REPOSITORY)
    private readonly searchProfileRepository: LeadsV2SearchProfileRepositoryPort,
  ) {}

  async resolveQuestionIdsByNormalizedKeys(keys: string[]): Promise<Record<string, string[]>> {
    if (keys.length === 0) return {};
    const uniqueKeys = [...new Set(keys)];
    const rows = await this.prisma.formQuestions.findMany({
      where: { keyNormalized: { in: uniqueKeys } },
      select: { id: true, keyNormalized: true },
    });

    const result: Record<string, string[]> = {};
    for (const key of uniqueKeys) {
      result[key] = [];
    }
    for (const row of rows) {
      result[row.keyNormalized] = [...(result[row.keyNormalized] ?? []), row.id];
    }
    return result;
  }

  async readFormAnswersBatch(params: {
    questionIds: string[];
    cursor: JobRunCursor | null;
    limit: number;
  }): Promise<FormAnswerBatchItem[]> {
    if (params.questionIds.length === 0 || params.limit <= 0) return [];
    const where: {
      questionId: { in: string[] };
      OR?: Array<{ createdAt: { gt: Date } } | { createdAt: Date; id: { gt: string } }>;
    } = {
      questionId: { in: params.questionIds },
    };

    if (params.cursor) {
      const cursorCreatedAt = new Date(params.cursor.createdAt);
      where.OR = [
        { createdAt: { gt: cursorCreatedAt } },
        { createdAt: cursorCreatedAt, id: { gt: params.cursor.id } },
      ];
    }

    const rows = await this.prisma.formAnswers.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: params.limit,
      select: {
        id: true,
        questionId: true,
        createdAt: true,
        valueText: true,
        valueNumber: true,
        submission: {
          select: {
            leadId: true,
          },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      questionId: row.questionId,
      createdAt: row.createdAt.toISOString(),
      leadId: row.submission.leadId,
      valueText: row.valueText,
      valueNumber: this.toNullableNumber(row.valueNumber),
    }));
  }

  async upsertLeadSearchProfile(batch: LeadSearchProfileUpsertPayload[]): Promise<void> {
    await this.searchProfileRepository.upsertBatch(batch);
  }

  async findLatestJobRunByStatuses(params: {
    jobName: string;
    statuses: JobRunStatus[];
  }): Promise<JobRunSnapshot | null> {
    const prismaStatuses = this.toPrismaStatuses(params.statuses);
    if (prismaStatuses.length === 0) return null;
    const row = await this.prisma.jobRuns.findFirst({
      where: {
        jobName: params.jobName,
        status: { in: prismaStatuses },
      },
      orderBy: { createdAt: 'desc' },
    });
    return row ? this.toJobRunSnapshot(row) : null;
  }

  async createJobRun(params: {
    jobName: string;
    status: JobRunStatus;
    cursor: JobRunCursor | null;
    processedRows: number;
    processedLeads: number;
    meta: Record<string, unknown>;
  }): Promise<JobRunSnapshot> {
    if (params.status === 'running') {
      const hasRunning = await this.hasRunningJobRun(params.jobName);
      if (hasRunning) {
        throw new Error('lock lógico ativo para este job');
      }
    }

    const now = new Date();
    const row = await this.prisma.jobRuns.create({
      data: {
        jobName: params.jobName,
        status: this.toPrismaStatus(params.status),
        fileName: JOB_FILE_NAME,
        filePath: JOB_FILE_PATH,
        fileHash: `${params.jobName}:${now.toISOString()}:${Math.random().toString(36).slice(2, 8)}`,
        sourceSystem: 'FORM',
        tagKey: JOB_TAG_KEY,
        processedRows: params.processedRows,
        processedOk: params.processedLeads,
        processedErrors: 0,
        meta: this.withCursor(params.meta, params.cursor),
        startedAt: now,
      },
    });
    return this.toJobRunSnapshot(row);
  }

  async hasRunningJobRun(jobName: string): Promise<boolean> {
    const count = await this.prisma.jobRuns.count({
      where: {
        jobName,
        status: 'RUNNING',
      },
    });
    return count > 0;
  }

  async failStaleRunningJobRuns(params: {
    jobName: string;
    staleBefore: Date;
    reason: string;
  }): Promise<number> {
    const result = await this.prisma.jobRuns.updateMany({
      where: {
        jobName: params.jobName,
        status: 'RUNNING',
        updatedAt: { lt: params.staleBefore },
      },
      data: {
        status: 'FAILED',
        errorMessage: params.reason,
        finishedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return result.count;
  }

  async updateJobRunProgress(params: {
    id: string;
    cursor: JobRunCursor | null;
    processedRows: number;
    processedLeads: number;
    meta?: Record<string, unknown>;
  }): Promise<void> {
    await this.prisma.jobRuns.update({
      where: { id: params.id },
      data: {
        processedRows: params.processedRows,
        processedOk: params.processedLeads,
        meta: this.withCursor(params.meta ?? {}, params.cursor),
        updatedAt: new Date(),
      },
    });
  }

  async markJobRunFailed(params: {
    id: string;
    cursor: JobRunCursor | null;
    processedRows: number;
    processedLeads: number;
    errorMessage: string;
    meta?: Record<string, unknown>;
  }): Promise<void> {
    await this.prisma.jobRuns.update({
      where: { id: params.id },
      data: {
        status: 'FAILED',
        processedRows: params.processedRows,
        processedOk: params.processedLeads,
        errorMessage: params.errorMessage,
        meta: this.withCursor(params.meta ?? {}, params.cursor),
        finishedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  async markJobRunCompleted(params: {
    id: string;
    cursor: JobRunCursor | null;
    processedRows: number;
    processedLeads: number;
    meta?: Record<string, unknown>;
  }): Promise<void> {
    await this.prisma.jobRuns.update({
      where: { id: params.id },
      data: {
        status: 'COMPLETED',
        processedRows: params.processedRows,
        processedOk: params.processedLeads,
        errorMessage: null,
        meta: this.withCursor(params.meta ?? {}, params.cursor),
        finishedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  private toNullableNumber(value: PrismaDecimal | number | null): number | null {
    if (value === null) return null;
    if (typeof value === 'number') return value;
    return value.toNumber();
  }

  private toPrismaStatus(status: JobRunStatus): PrismaJobStatus {
    if (status === 'running') return 'RUNNING';
    if (status === 'failed') return 'FAILED';
    return 'COMPLETED';
  }

  private toPrismaStatuses(statuses: JobRunStatus[]): PrismaJobStatus[] {
    return [...new Set(statuses.map((status) => this.toPrismaStatus(status)))];
  }

  private toJobRunSnapshot(row: JobRunRow): JobRunSnapshot {
    return {
      id: row.id,
      jobName: row.jobName,
      status: this.toDomainStatus(row.status),
      cursor: this.extractCursor(row.meta),
      processedRows: row.processedRows,
      processedLeads: row.processedOk,
      meta: row.meta ?? {},
    };
  }

  private toDomainStatus(status: PrismaJobStatus): JobRunStatus {
    if (status === 'RUNNING') return 'running';
    if (status === 'FAILED') return 'failed';
    return 'completed';
  }

  private extractCursor(meta: Record<string, unknown> | null): JobRunCursor | null {
    const cursor = (meta?.cursor ?? null) as { createdAt?: unknown; id?: unknown } | null;
    if (!cursor) return null;
    if (typeof cursor.createdAt !== 'string' || typeof cursor.id !== 'string') return null;
    return {
      createdAt: cursor.createdAt,
      id: cursor.id,
    };
  }

  private withCursor(meta: Record<string, unknown>, cursor: JobRunCursor | null): Record<string, unknown> {
    if (!cursor) return { ...meta };
    return {
      ...meta,
      cursor: {
        createdAt: cursor.createdAt,
        id: cursor.id,
      },
    };
  }
}
