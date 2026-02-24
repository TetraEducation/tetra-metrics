export const NORMALIZE_LEAD_SEARCH_PROFILE_PORT = Symbol('NORMALIZE_LEAD_SEARCH_PROFILE_PORT');

export type JobRunStatus = 'running' | 'failed' | 'completed';

export interface JobRunCursor {
  createdAt: string;
  id: string;
}

export interface JobRunSnapshot {
  id: string;
  jobName: string;
  status: JobRunStatus;
  cursor: JobRunCursor | null;
  processedRows: number;
  processedLeads: number;
  meta: Record<string, unknown>;
}

export interface FormAnswerBatchItem {
  id: string;
  questionId: string;
  createdAt: string;
  leadId: string | null;
  valueText: string | null;
  valueNumber: number | null;
}

export interface LeadSearchProfileUpsertPayload {
  leadId: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  ageMin?: number | null;
  ageMax?: number | null;
  gender?: string | null;
  companySize?: string | null;
  educationLevel?: string | null;
  excelKnowledge?: string | null;
  jobRole?: string | null;
  seniorityLevel?: string | null;
  currentCompany?: string | null;
}

export interface NormalizeLeadSearchProfilePort {
  resolveQuestionIdsByNormalizedKeys(keys: string[]): Promise<Record<string, string[]>>;
  readFormAnswersBatch(params: {
    questionIds: string[];
    cursor: JobRunCursor | null;
    limit: number;
  }): Promise<FormAnswerBatchItem[]>;
  upsertLeadSearchProfile(batch: LeadSearchProfileUpsertPayload[]): Promise<void>;
  findLatestJobRunByStatuses(params: {
    jobName: string;
    statuses: JobRunStatus[];
  }): Promise<JobRunSnapshot | null>;
  createJobRun(params: {
    jobName: string;
    status: JobRunStatus;
    cursor: JobRunCursor | null;
    processedRows: number;
    processedLeads: number;
    meta: Record<string, unknown>;
  }): Promise<JobRunSnapshot>;
  hasRunningJobRun(jobName: string): Promise<boolean>;
  failStaleRunningJobRuns(params: {
    jobName: string;
    staleBefore: Date;
    reason: string;
  }): Promise<number>;
  updateJobRunProgress(params: {
    id: string;
    cursor: JobRunCursor | null;
    processedRows: number;
    processedLeads: number;
    meta?: Record<string, unknown>;
  }): Promise<void>;
  markJobRunFailed(params: {
    id: string;
    cursor: JobRunCursor | null;
    processedRows: number;
    processedLeads: number;
    errorMessage: string;
    meta?: Record<string, unknown>;
  }): Promise<void>;
  markJobRunCompleted(params: {
    id: string;
    cursor: JobRunCursor | null;
    processedRows: number;
    processedLeads: number;
    meta?: Record<string, unknown>;
  }): Promise<void>;
}
