import type { LeadSourceSystemV2 } from '@/modules/leads-v2/application/ports/leads-v2-repository.port';

export const LEADS_V2_JOB_RUNS_REPOSITORY = Symbol('LEADS_V2_JOB_RUNS_REPOSITORY');

export type JobRunStatusV2 = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export type JobRunV2 = {
  id: string;
  jobName: string;
  status: JobRunStatusV2;
  fileName: string;
  filePath: string;
  fileHash: string;
  sourceSystem: LeadSourceSystemV2;
  tagKey: string;
  startedAt: string | null;
  finishedAt: string | null;
  lastProcessedRow: number;
  totalRows: number | null;
  processedRows: number;
  processedOk: number;
  processedErrors: number;
  retryCount: number;
  errorMessage: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CreateSpreadsheetJobRunInput = {
  jobName: string;
  fileName: string;
  filePath: string;
  fileHash: string;
  sourceSystem: LeadSourceSystemV2;
  tagKey: string;
  meta?: Record<string, unknown>;
};

export type UpdateJobRunProgressInput = {
  id: string;
  lastProcessedRow: number;
  totalRows?: number | null;
  processedRows: number;
  processedOk: number;
  processedErrors: number;
  meta?: Record<string, unknown>;
};

export interface LeadsV2JobRunsRepositoryPort {
  createPending(input: CreateSpreadsheetJobRunInput): Promise<JobRunV2>;
  hasBlockingRunByHash(params: { jobName: string; fileHash: string }): Promise<boolean>;
  claimNextRunnable(jobName: string, maxRetries: number): Promise<JobRunV2 | null>;
  findById(id: string): Promise<JobRunV2 | null>;
  hasRunning(jobName: string): Promise<boolean>;
  list(params: { jobName?: string; status?: JobRunStatusV2; limit: number }): Promise<JobRunV2[]>;
  updateFilePath(id: string, filePath: string, meta?: Record<string, unknown>): Promise<void>;
  markCompleted(id: string, input: Pick<UpdateJobRunProgressInput, 'totalRows' | 'processedRows' | 'processedOk' | 'processedErrors' | 'meta'>): Promise<void>;
  markFailed(id: string, input: { errorMessage: string; meta?: Record<string, unknown> }): Promise<void>;
  markPendingForRetry(id: string): Promise<JobRunV2>;
  updateProgress(input: UpdateJobRunProgressInput): Promise<void>;
  failStaleRunningRuns(params: { jobName: string; staleBefore: Date; reason: string }): Promise<number>;
}
