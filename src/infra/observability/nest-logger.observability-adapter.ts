import { Injectable, Logger } from '@nestjs/common';
import type { ObservabilityAdapter } from '@/infra/observability/observability.adapter';

@Injectable()
export class NestLoggerObservabilityAdapter implements ObservabilityAdapter {
  private readonly logger = new Logger(NestLoggerObservabilityAdapter.name);

  info(event: string, payload: Record<string, unknown>): void {
    this.logger.log({ event, ...payload });
  }

  warn(event: string, payload: Record<string, unknown>): void {
    this.logger.warn({ event, ...payload });
  }

  error(event: string, payload: Record<string, unknown>, error?: unknown): void {
    this.logger.error({ event, ...payload }, error instanceof Error ? error.stack : undefined);
  }
}
