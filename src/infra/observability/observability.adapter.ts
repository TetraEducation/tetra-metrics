export const OBSERVABILITY_ADAPTER = Symbol('OBSERVABILITY_ADAPTER');

export interface ObservabilityAdapter {
  info(event: string, payload: Record<string, unknown>): void;
  warn(event: string, payload: Record<string, unknown>): void;
  error(event: string, payload: Record<string, unknown>, error?: unknown): void;
}
