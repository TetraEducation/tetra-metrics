import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, readdir, readFile, stat, unlink } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import type { LeadsListingSearchDto } from '@/modules/leads/application/dto/leads-listing.dto';
import { LeadsV2ExportService } from '@/modules/leads-v2/application/services/leads-v2-export.service';
import { LEADS_V2_EXPORT_CSV_JOB_NAME } from '@/modules/leads-v2/application/constants/leads-v2-job-names';
import {
  LEADS_V2_JOB_RUNS_REPOSITORY,
  type JobRunStatusV2,
  type LeadsV2JobRunsRepositoryPort,
} from '@/modules/leads-v2/application/ports/leads-v2-job-runs.port';

const EXPORT_RETENTION_DAYS = 3;
const MAX_AUTO_RETRIES = 3;
const STALE_RUNNING_MINUTES = 2;

@Injectable()
export class LeadsV2ExportJobsService {
  private readonly logger = new Logger(LeadsV2ExportJobsService.name);

  constructor(
    @Inject(LEADS_V2_JOB_RUNS_REPOSITORY)
    private readonly jobRuns: LeadsV2JobRunsRepositoryPort,
    private readonly leadsExport: LeadsV2ExportService,
  ) {}

  async queueExport(filters: LeadsListingSearchDto): Promise<{ operationId: string; status: JobRunStatusV2 }> {
    const normalizedFilters = this.normalizeFilters(filters);
    const created = await this.jobRuns.createPending({
      jobName: LEADS_V2_EXPORT_CSV_JOB_NAME,
      fileName: this.buildFileName(),
      filePath: '',
      fileHash: this.hashPayload(`${JSON.stringify(normalizedFilters)}:${Date.now()}:${randomUUID()}`),
      sourceSystem: 'SPREADSHEET',
      tagKey: 'EXPORT',
      meta: {
        filters: normalizedFilters,
      },
    });

    return {
      operationId: created.id,
      status: created.status,
    };
  }

  async processNextPendingRun(): Promise<void> {
    await this.recoverStaleRunningRuns();
    const claimed = await this.jobRuns.claimNextRunnable(LEADS_V2_EXPORT_CSV_JOB_NAME, MAX_AUTO_RETRIES);
    if (!claimed) return;

    let outputPath: string | null = null;
    try {
      const filters = this.extractFilters(claimed.meta);
      outputPath = await this.prepareOutputPath(claimed.id);
      const progress = await this.leadsExport.exportLeadsToFile(filters, outputPath, {
        onProgress: async (snapshot) => {
          await this.jobRuns.updateProgress({
            id: claimed.id,
            lastProcessedRow: snapshot.lastProcessedRow,
            totalRows: snapshot.totalRows,
            processedRows: snapshot.processedRows,
            processedOk: snapshot.processedOk,
            processedErrors: snapshot.processedErrors,
            meta: claimed.meta,
          });
        },
      });
      const now = Date.now();
      const expiresAt = new Date(now + EXPORT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const meta = {
        ...claimed.meta,
        downloadPath: outputPath,
        downloadFileName: basename(outputPath),
        downloadUrl: `/v2/leads/exports/${claimed.id}/download`,
        expiresAt,
      };

      await this.jobRuns.updateFilePath(claimed.id, outputPath, meta);
      await this.jobRuns.markCompleted(claimed.id, {
        totalRows: progress.totalRows,
        processedRows: progress.processedRows,
        processedOk: progress.processedOk,
        processedErrors: progress.processedErrors,
        meta,
      });
    } catch (error) {
      if (outputPath) {
        await this.deleteFileIfExists(outputPath);
      }
      const reason = error instanceof Error ? error.message : String(error);
      await this.jobRuns.markFailed(claimed.id, {
        errorMessage: reason,
        meta: claimed.meta,
      });
      this.logger.error(`Falha ao gerar export ${claimed.id}: ${reason}`);
    }
  }

  async cleanupExpiredExports(): Promise<{ deleted: number }> {
    const exportDir = this.getExportsDir();
    await this.ensureDir(exportDir);
    const entries = await readdir(exportDir);
    let deleted = 0;
    const now = Date.now();
    const retentionMs = EXPORT_RETENTION_DAYS * 24 * 60 * 60 * 1000;

    for (const entry of entries) {
      const fullPath = join(exportDir, entry);
      try {
        const fileStat = await stat(fullPath);
        if (!fileStat.isFile()) continue;
        if (now - fileStat.mtimeMs < retentionMs) continue;
        await unlink(fullPath);
        deleted++;
      } catch {
        // Ignora erro pontual de IO para não interromper o ciclo de limpeza.
      }
    }

    return { deleted };
  }

  async getDownloadFile(operationId: string): Promise<{ path: string; fileName: string }> {
    const run = await this.jobRuns.findById(operationId);
    if (!run || run.jobName !== LEADS_V2_EXPORT_CSV_JOB_NAME) {
      throw new BadRequestException('Operação de exportação não encontrada.');
    }
    if (run.status !== 'COMPLETED') {
      throw new BadRequestException('A exportação ainda não está disponível para download.');
    }
    const expiresAt = this.extractOptionalString(run.meta, 'expiresAt');
    if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
      throw new BadRequestException('Arquivo de exportação expirado.');
    }
    const downloadPath = this.extractOptionalString(run.meta, 'downloadPath');
    if (!downloadPath || !(await this.fileExists(downloadPath))) {
      throw new BadRequestException('Arquivo de exportação não encontrado.');
    }
    return {
      path: downloadPath,
      fileName: this.extractOptionalString(run.meta, 'downloadFileName') ?? basename(downloadPath),
    };
  }

  async readDownloadFile(operationId: string): Promise<{ fileName: string; content: Buffer }> {
    const file = await this.getDownloadFile(operationId);
    const content = await readFile(file.path);
    return { fileName: file.fileName, content };
  }

  private async recoverStaleRunningRuns(): Promise<void> {
    const staleBefore = new Date(Date.now() - STALE_RUNNING_MINUTES * 60 * 1000);
    await this.jobRuns.failStaleRunningRuns({
      jobName: LEADS_V2_EXPORT_CSV_JOB_NAME,
      staleBefore,
      reason: 'Run de exportação marcada como stale.',
    });
  }

  private extractFilters(meta: Record<string, unknown>): LeadsListingSearchDto {
    const raw = meta.filters;
    if (!raw || typeof raw !== 'object') return {};
    return raw as LeadsListingSearchDto;
  }

  private normalizeFilters(filters: LeadsListingSearchDto): LeadsListingSearchDto {
    return { ...filters };
  }

  private async prepareOutputPath(operationId: string): Promise<string> {
    const exportDir = this.getExportsDir();
    await this.ensureDir(exportDir);
    const fullPath = join(exportDir, `${operationId}_leads-export.csv`);
    return fullPath;
  }

  private getExportsDir(): string {
    return join(process.cwd(), 'imports', 'v2', 'exports');
  }

  private async ensureDir(path: string): Promise<void> {
    await mkdir(path, { recursive: true });
  }

  private hashPayload(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private buildFileName(): string {
    return `leads-export-${Date.now()}.csv`;
  }

  private extractOptionalString(meta: Record<string, unknown>, key: string): string | null {
    const value = meta[key];
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  private async fileExists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  private async deleteFileIfExists(path: string): Promise<void> {
    if (!(await this.fileExists(path))) return;
    await unlink(path);
  }
}
