import type { InferredColumns } from '@/modules/imports/domain/column-inference';

export const COLUMN_INFERENCE = Symbol('COLUMN_INFERENCE');

export interface ColumnInferencePort {
  infer(headers: string[], rows: Array<Record<string, unknown>>): InferredColumns;
}
