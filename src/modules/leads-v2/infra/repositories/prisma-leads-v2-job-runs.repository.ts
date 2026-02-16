import { Inject, Injectable } from '@nestjs/common';
import { PRISMA_V2 } from '@/infra/prisma-v2/prisma-v2.provider';
import type {
  CreateSpreadsheetJobRunInput,
  JobRunV2,
  JobRunStatusV2,
  LeadsV2JobRunsRepositoryPort,
  UpdateJobRunProgressInput,
} from '@/modules/leads-v2/application/ports/leads-v2-job-runs.port';

type PrismaV2Client = {
  jobRuns: {
    create: (args: {
      data: {
        jobName: string;
        status: JobRunStatusV2;
        fileName: string;
        filePath: string;
        fileHash: string;
        sourceSystem: string;
        tagKey: string;
        meta: Record<string, unknown>;
      };
    }) => Promise<JobRunRow>;
    findFirst: (args: {
      where: {
        jobName?: string;
        fileHash?: string;
        status?: JobRunStatusV2 | { in: JobRunStatusV2[] };
        retryCount?: { lt: number };
        updatedAt?: { lt: Date };
      };
      orderBy?: { createdAt: 'asc' | 'desc' };
    }) => Promise<JobRunRow | null>;
    findUnique: (args: { where: { id: string } }) => Promise<JobRunRow | null>;
    findMany: (args: {
      where?: { status?: JobRunStatusV2 };
      orderBy: { createdAt: 'desc' };
      take: number;
    }) => Promise<JobRunRow[]>;
    count: (args: { where: { jobName: string; status: JobRunStatusV2 } }) => Promise<number>;
    updateMany: (args: {
      where: {
        id?: string;
        jobName?: string;
        status?: JobRunStatusV2 | { in: JobRunStatusV2[] };
        updatedAt?: { lt: Date };
      };
      data: {
        status?: JobRunStatusV2;
        startedAt?: Date | null;
        finishedAt?: Date | null;
        filePath?: string;
        retryCount?: number;
        errorMessage?: string | null;
        updatedAt?: Date;
      };
    }) => Promise<{ count: number }>;
    update: (args: {
      where: { id: string };
      data: {
        status?: JobRunStatusV2;
        startedAt?: Date | null;
        finishedAt?: Date | null;
        filePath?: string;
        lastProcessedRow?: number;
        totalRows?: number | null;
        processedRows?: number;
        processedOk?: number;
        processedErrors?: number;
        errorMessage?: string | null;
        meta?: Record<string, unknown>;
        updatedAt?: Date;
      };
    }) => Promise<JobRunRow>;
  };
};

type JobRunRow = {
  id: string;
  jobName: string;
  status: JobRunStatusV2;
  fileName: string;
  filePath: string;
  fileHash: string;
  sourceSystem: string;
  tagKey: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  lastProcessedRow: number;
  totalRows: number | null;
  processedRows: number;
  processedOk: number;
  processedErrors: number;
  retryCount: number;
  errorMessage: string | null;
  meta: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class PrismaLeadsV2JobRunsRepository implements LeadsV2JobRunsRepositoryPort {
  constructor(@Inject(PRISMA_V2) private readonly prisma: PrismaV2Client) {}

  async createPending(input: CreateSpreadsheetJobRunInput): Promise<JobRunV2> {
    const row = await this.prisma.jobRuns.create({
      data: {
        jobName: input.jobName,
        status: 'PENDING',
        fileName: input.fileName,
        filePath: input.filePath,
        fileHash: input.fileHash,
        sourceSystem: input.sourceSystem,
        tagKey: input.tagKey,
        meta: input.meta ?? {},
      },
    });
    return this.mapJobRun(row);
  }

  async hasBlockingRunByHash(params: { jobName: string; fileHash: string }): Promise<boolean> {
    const row = await this.prisma.jobRuns.findFirst({
      where: {
        jobName: params.jobName,
        fileHash: params.fileHash,
        status: { in: ['PENDING', 'RUNNING', 'COMPLETED'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    return Boolean(row);
  }

  async claimNextRunnable(jobName: string, maxRetries: number): Promise<JobRunV2 | null> {
    const pending = await this.prisma.jobRuns.findFirst({
      where: {
        jobName,
        status: 'PENDING',
      },
      orderBy: { createdAt: 'asc' },
    });
    const failedRecoverable = pending
      ? null
      : await this.prisma.jobRuns.findFirst({
          where: {
            jobName,
            status: 'FAILED',
            retryCount: { lt: maxRetries },
          },
          orderBy: { createdAt: 'asc' },
        });
    const next = pending ?? failedRecoverable;

    if (!next) return null;

    try {
      const now = new Date();
      const claimed = await this.prisma.jobRuns.updateMany({
        where: {
          id: next.id,
          status: { in: ['PENDING', 'FAILED'] },
        },
        data: {
          status: 'RUNNING',
          startedAt: now,
          finishedAt: null,
          retryCount: next.retryCount + 1,
          errorMessage: null,
          updatedAt: now,
        },
      });

      if (claimed.count === 0) {
        return null;
      }
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        return null;
      }
      throw error;
    }

    const row = await this.prisma.jobRuns.findUnique({ where: { id: next.id } });
    return row ? this.mapJobRun(row) : null;
  }

  async findById(id: string): Promise<JobRunV2 | null> {
    const row = await this.prisma.jobRuns.findUnique({ where: { id } });
    return row ? this.mapJobRun(row) : null;
  }

  async hasRunning(jobName: string): Promise<boolean> {
    const count = await this.prisma.jobRuns.count({
      where: { jobName, status: 'RUNNING' },
    });
    return count > 0;
  }

  async list(params: { status?: JobRunStatusV2; limit: number }): Promise<JobRunV2[]> {
    const rows = await this.prisma.jobRuns.findMany({
      where: params.status ? { status: params.status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: params.limit,
    });
    return rows.map((row) => this.mapJobRun(row));
  }

  async updateFilePath(id: string, filePath: string, meta?: Record<string, unknown>): Promise<void> {
    await this.prisma.jobRuns.update({
      where: { id },
      data: {
        filePath,
        meta: meta ?? {},
        updatedAt: new Date(),
      },
    });
  }

  async updateProgress(input: UpdateJobRunProgressInput): Promise<void> {
    await this.prisma.jobRuns.update({
      where: { id: input.id },
      data: {
        lastProcessedRow: input.lastProcessedRow,
        totalRows: input.totalRows ?? null,
        processedRows: input.processedRows,
        processedOk: input.processedOk,
        processedErrors: input.processedErrors,
        meta: input.meta ?? {},
        updatedAt: new Date(),
      },
    });
  }

  async markCompleted(
    id: string,
    input: Pick<
      UpdateJobRunProgressInput,
      'totalRows' | 'processedRows' | 'processedOk' | 'processedErrors' | 'meta'
    >,
  ): Promise<void> {
    await this.prisma.jobRuns.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        finishedAt: new Date(),
        totalRows: input.totalRows ?? null,
        processedRows: input.processedRows,
        processedOk: input.processedOk,
        processedErrors: input.processedErrors,
        meta: input.meta ?? {},
        errorMessage: null,
        updatedAt: new Date(),
      },
    });
  }

  async markFailed(
    id: string,
    input: { errorMessage: string; meta?: Record<string, unknown> },
  ): Promise<void> {
    await this.prisma.jobRuns.update({
      where: { id },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        errorMessage: input.errorMessage,
        meta: input.meta ?? {},
        updatedAt: new Date(),
      },
    });
  }

  async markPendingForRetry(id: string): Promise<JobRunV2> {
    const row = await this.prisma.jobRuns.update({
      where: { id },
      data: {
        status: 'PENDING',
        errorMessage: null,
        finishedAt: null,
        updatedAt: new Date(),
      },
    });
    return this.mapJobRun(row);
  }

  async failStaleRunningRuns(params: {
    jobName: string;
    staleBefore: Date;
    reason: string;
  }): Promise<number> {
    const now = new Date();
    const result = await this.prisma.jobRuns.updateMany({
      where: {
        jobName: params.jobName,
        status: 'RUNNING',
        updatedAt: { lt: params.staleBefore },
      },
      data: {
        status: 'FAILED',
        finishedAt: now,
        errorMessage: params.reason,
        updatedAt: now,
      },
    });
    return result.count;
  }

  private mapJobRun(row: JobRunRow): JobRunV2 {
    return {
      id: row.id,
      jobName: row.jobName,
      status: row.status,
      fileName: row.fileName,
      filePath: row.filePath,
      fileHash: row.fileHash,
      sourceSystem: row.sourceSystem as JobRunV2['sourceSystem'],
      tagKey: row.tagKey,
      startedAt: row.startedAt?.toISOString() ?? null,
      finishedAt: row.finishedAt?.toISOString() ?? null,
      lastProcessedRow: row.lastProcessedRow,
      totalRows: row.totalRows,
      processedRows: row.processedRows,
      processedOk: row.processedOk,
      processedErrors: row.processedErrors,
      retryCount: row.retryCount,
      errorMessage: row.errorMessage,
      meta: row.meta ?? {},
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private isUniqueConstraintError(error: unknown): boolean {
    const e = error as { code?: string; message?: string };
    return (
      e?.code === 'P2002' ||
      e?.message?.toLowerCase().includes('unique') === true ||
      e?.message?.toLowerCase().includes('duplicate') === true
    );
  }
}
