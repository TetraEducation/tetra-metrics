import type { InferredColumns } from './column-inference';

export interface ImportFileInfo {
  name: string;
  tagKey: string;
  hash: string;
  rows: number;
}

export interface ImportError {
  row: number;
  reason: string;
}

export interface ImportTotals {
  processed: number;
  ok: number;
  ignoredInvalidEmail: number;
  errors: number;
  surveyDetected?: boolean;
  surveyQuestionsCount?: number;
  surveyResponsesSaved?: number;
}

export interface ImportReport {
  file: ImportFileInfo;
  inferred: InferredColumns;
  totals: ImportTotals;
  errors: ImportError[];
  dryRun: boolean;
}

