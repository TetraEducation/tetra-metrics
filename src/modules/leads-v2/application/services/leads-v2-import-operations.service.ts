import { Inject, Injectable } from '@nestjs/common';
import {
  LEADS_V2_JOB_RUNS_REPOSITORY,
  type JobRunStatusV2,
  type JobRunV2,
  type LeadsV2JobRunsRepositoryPort,
} from '@/modules/leads-v2/application/ports/leads-v2-job-runs.port';
import { LEADS_V2_EXPORT_CSV_JOB_NAME } from '@/modules/leads-v2/application/constants/leads-v2-job-names';
import type {
  ImportOperationErrorDto,
  ImportOperationResponseDto,
  ImportOperationStatus,
} from '@/modules/leads-v2/interface/http/import-operation.dto';

@Injectable()
export class LeadsV2ImportOperationsService {
  constructor(
    @Inject(LEADS_V2_JOB_RUNS_REPOSITORY)
    private readonly jobRuns: LeadsV2JobRunsRepositoryPort,
  ) {}

  async getOperationById(operationId: string): Promise<ImportOperationResponseDto | null> {
    const run = await this.jobRuns.findById(operationId);
    if (!run) return null;
    return this.toImportOperation(run);
  }

  private toImportOperation(run: JobRunV2): ImportOperationResponseDto {
    const progressPercent = this.computeProgressPercent(run.processedRows, run.totalRows);
    const errors = this.extractErrors(run);
    const exportMeta = this.extractExportMeta(run);
    return {
      id: run.id,
      status: this.mapStatus(run.status),
      progressPercent,
      etaSeconds: null,
      counts: {
        processed: run.processedRows,
        created: run.processedOk,
        updated: 0,
        skipped: 0,
        failed: run.processedErrors,
      },
      errors,
      createdAt: run.createdAt,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      correlationId: this.extractCorrelationId(run.meta),
      downloadUrl: exportMeta.downloadUrl,
      expiresAt: exportMeta.expiresAt,
    };
  }

  private mapStatus(status: JobRunStatusV2): ImportOperationStatus {
    if (status === 'PENDING') return 'QUEUED';
    if (status === 'RUNNING') return 'RUNNING';
    if (status === 'COMPLETED') return 'SUCCEEDED';
    return 'FAILED';
  }

  private computeProgressPercent(processedRows: number, totalRows: number | null): number {
    if (!totalRows || totalRows <= 0) {
      return 0;
    }
    const raw = Math.round((processedRows / totalRows) * 100);
    if (raw < 0) return 0;
    if (raw > 100) return 100;
    return raw;
  }

  private extractErrors(run: JobRunV2): ImportOperationErrorDto[] {
    const fromMeta = this.extractMetaErrors(run.meta);
    if (fromMeta.length > 0) return fromMeta;
    if (!run.errorMessage) return [];
    return [{ row: 0, reason: run.errorMessage }];
  }

  private extractMetaErrors(meta: Record<string, unknown>): ImportOperationErrorDto[] {
    const value = meta.errors;
    if (!Array.isArray(value)) return [];
    return value
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => {
        const row = Number((entry as { row?: unknown }).row);
        const reason = String((entry as { reason?: unknown }).reason ?? 'Erro desconhecido');
        const column = this.optionalString(entry, 'column');
        const rawValue = this.optionalString(entry, 'value');
        const code = this.optionalString(entry, 'code');
        const questionId = this.optionalString(entry, 'questionId');
        return {
          row: Number.isFinite(row) ? row : 0,
          reason,
          column,
          value: rawValue,
          code,
          questionId,
        };
      });
  }

  private optionalString(entry: unknown, key: 'column' | 'value' | 'code' | 'questionId') {
    if (!entry || typeof entry !== 'object') return undefined;
    const value = (entry as Record<string, unknown>)[key];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private extractCorrelationId(meta: Record<string, unknown>): string | null {
    const candidates = [
      meta.correlationId,
      meta.correlation_id,
      (meta.headers as Record<string, unknown> | undefined)?.['x-correlation-id'],
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.length > 0) {
        return candidate;
      }
    }
    return null;
  }

  private extractExportMeta(run: JobRunV2): { downloadUrl: string | null; expiresAt: string | null } {
    if (run.jobName !== LEADS_V2_EXPORT_CSV_JOB_NAME) {
      return { downloadUrl: null, expiresAt: null };
    }
    const expiresAt = this.optionalMetaString(run.meta, 'expiresAt');
    if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
      return { downloadUrl: null, expiresAt };
    }
    return {
      downloadUrl: this.optionalMetaString(run.meta, 'downloadUrl'),
      expiresAt,
    };
  }

  private optionalMetaString(meta: Record<string, unknown>, key: string): string | null {
    const value = meta[key];
    if (typeof value !== 'string') return null;
    return value.length > 0 ? value : null;
  }
}
