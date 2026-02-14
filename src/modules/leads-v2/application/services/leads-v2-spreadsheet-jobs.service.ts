import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve, sep } from 'node:path';
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { fileBaseName, normalizeEmail, normalizeText } from '@/modules/imports/application/utils/normalize';
import type { ColumnInferencePort } from '@/modules/imports/application/ports/column-inference.port';
import { COLUMN_INFERENCE } from '@/modules/imports/application/ports/column-inference.port';
import type { SpreadsheetParserPort } from '@/modules/imports/application/ports/spreadsheet-parser.port';
import { SPREADSHEET_PARSER } from '@/modules/imports/application/ports/spreadsheet-parser.port';
import {
  LEADS_V2_JOB_RUNS_REPOSITORY,
  type JobRunV2,
  type JobRunStatusV2,
  type LeadsV2JobRunsRepositoryPort,
} from '@/modules/leads-v2/application/ports/leads-v2-job-runs.port';
import { LeadsV2ImportService } from '@/modules/leads-v2/application/services/leads-v2-import.service';

const JOB_NAME = 'leads_v2_spreadsheet_import';
const CHUNK_SIZE = 100;
const MAX_ERROR_SAMPLES = 30;
const MAX_AUTO_RETRIES = 3;
const STALE_RUNNING_MINUTES = 1;

type ProcessedStats = {
  processedRows: number;
  processedOk: number;
  processedErrors: number;
  lastProcessedRow: number;
  totalRows: number;
  errors: Array<{ row: number; reason: string }>;
};

@Injectable()
export class LeadsV2SpreadsheetJobsService {
  private readonly logger = new Logger(LeadsV2SpreadsheetJobsService.name);

  constructor(
    @Inject(LEADS_V2_JOB_RUNS_REPOSITORY)
    private readonly jobRuns: LeadsV2JobRunsRepositoryPort,
    @Inject(SPREADSHEET_PARSER) private readonly parser: SpreadsheetParserPort,
    @Inject(COLUMN_INFERENCE) private readonly infer: ColumnInferencePort,
    private readonly leadsImport: LeadsV2ImportService,
  ) {}

  async queueSpreadsheet(params: {
    file: Express.Multer.File;
    sourceSystem?: string;
    tagKey?: string;
  }): Promise<{ jobRunId: string; status: JobRunStatusV2 }> {
    const sourceSystem = this.normalizeSourceSystem(params.sourceSystem);
    const tagKey = this.resolveTagKey(params.tagKey, params.file.originalname);
    const fileHash = this.hashBuffer(params.file.buffer);
    const filePath = await this.savePendingFile(params.file.originalname, fileHash, params.file.buffer);

    try {
      const created = await this.jobRuns.createPending({
        jobName: JOB_NAME,
        fileName: params.file.originalname,
        filePath,
        fileHash,
        sourceSystem,
        tagKey,
        meta: {
          mimeType: params.file.mimetype,
          fileSize: params.file.size,
        },
      });

      return {
        jobRunId: created.id,
        status: created.status,
      };
    } catch (error) {
      await this.safeUnlink(filePath);
      if (this.isUniqueConstraintError(error)) {
        throw new BadRequestException(
          'Este arquivo já foi registrado anteriormente para processamento.',
        );
      }
      throw error;
    }
  }

  async listRuns(params: { status?: JobRunStatusV2; limit?: number }) {
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
    return this.jobRuns.list({ status: params.status, limit });
  }

  async retryRun(id: string) {
    const run = await this.jobRuns.findById(id);
    if (!run) {
      throw new BadRequestException('Job run não encontrado.');
    }
    if (run.status !== 'FAILED') {
      throw new BadRequestException('Apenas runs com status FAILED podem ser reenfileirados.');
    }
    return this.jobRuns.markPendingForRetry(id);
  }

  async processNextPendingRun(): Promise<void> {
    await this.recoverStaleRunningRuns();

    const claimed = await this.jobRuns.claimNextRunnable(JOB_NAME, MAX_AUTO_RETRIES);
    if (!claimed) {
      this.logger.debug('Sem jobs elegíveis para processamento neste ciclo.');
      return;
    }

    this.logger.log(`Iniciando processamento do job ${claimed.id} (${claimed.fileName})`);
    const sourcePath = await this.resolveCurrentFilePath(claimed);
    const processingPath = this.isPathInsideDir(sourcePath, 'processing')
      ? sourcePath
      : await this.moveToProcessing(sourcePath, claimed.id);

    let currentMeta = this.mergeMetaWithPaths(claimed.meta, {
      pendingPath: claimed.filePath,
      processingPath,
    });
    await this.jobRuns.updateFilePath(claimed.id, processingPath, currentMeta);

    try {
      const fileBuffer = await readFile(processingPath);
      const parsed = this.parser.parse({
        buffer: fileBuffer,
        mimeType: this.resolveMimeTypeFromName(claimed.fileName),
        originalName: claimed.fileName,
      });
      const inferred = this.infer.infer(parsed.headers, parsed.rows);

      const stats = await this.processRows({
        runId: claimed.id,
        rows: parsed.rows,
        inferred,
        startFromRow: claimed.lastProcessedRow + 1,
        sourceSystem: claimed.sourceSystem,
        tagKey: claimed.tagKey,
        fileHash: claimed.fileHash,
        existingStats: {
          processedRows: claimed.processedRows,
          processedOk: claimed.processedOk,
          processedErrors: claimed.processedErrors,
        },
        existingErrors: this.extractErrorsFromMeta(claimed.meta),
      });

      const donePath = await this.moveToDone(processingPath, claimed.id);
      const completedMeta = this.mergeMetaWithPaths(currentMeta, {
        pendingPath: claimed.filePath,
        processingPath,
        donePath,
      });
      currentMeta = this.mergeMeta(completedMeta, {
        inferred,
        errors: stats.errors,
      });
      await this.jobRuns.updateFilePath(claimed.id, donePath, currentMeta);

      await this.jobRuns.markCompleted(claimed.id, {
        totalRows: stats.totalRows,
        processedRows: stats.processedRows,
        processedOk: stats.processedOk,
        processedErrors: stats.processedErrors,
        meta: currentMeta,
      });

      this.logger.log(
        `Job ${claimed.id} concluído. processed=${stats.processedRows} ok=${stats.processedOk} errors=${stats.processedErrors}`,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const failedPath = await this.safeMoveToFailed(processingPath, claimed.id);

      const failedMeta = this.mergeMetaWithPaths(currentMeta, {
        pendingPath: claimed.filePath,
        processingPath,
        failedPath,
      });
      await this.jobRuns.updateFilePath(claimed.id, failedPath, failedMeta);

      await this.jobRuns.markFailed(claimed.id, {
        errorMessage: reason,
        meta: failedMeta,
      });

      this.logger.error(`Job ${claimed.id} falhou: ${reason}`);
    }
  }

  private async processRows(params: {
    runId: string;
    rows: Array<Record<string, unknown>>;
    inferred: {
      emailKey: string;
      fullNameKey: string | null;
      nameKey: string | null;
      surnameKey: string | null;
      phoneKey: string | null;
    };
    startFromRow: number;
    sourceSystem: 'CLINT' | 'SPREADSHEET' | 'ACTIVECAMPAIGN' | 'FORM';
    tagKey: string;
    fileHash: string;
    existingStats: { processedRows: number; processedOk: number; processedErrors: number };
    existingErrors: Array<{ row: number; reason: string }>;
  }): Promise<ProcessedStats> {
    const stats: ProcessedStats = {
      processedRows: params.existingStats.processedRows,
      processedOk: params.existingStats.processedOk,
      processedErrors: params.existingStats.processedErrors,
      lastProcessedRow: Math.max(params.startFromRow - 1, 0),
      totalRows: params.rows.length,
      errors: [...params.existingErrors],
    };

    for (
      let currentIndex = Math.max(params.startFromRow - 1, 0);
      currentIndex < params.rows.length;
      currentIndex += CHUNK_SIZE
    ) {
      const chunkEnd = Math.min(currentIndex + CHUNK_SIZE, params.rows.length);
      for (let i = currentIndex; i < chunkEnd; i++) {
        const row = params.rows[i];
        const rowNumber = i + 2;
        stats.processedRows++;

        const emailRaw = normalizeText(row[params.inferred.emailKey]);
        const emailNorm = normalizeEmail(emailRaw ?? undefined);

        if (!emailNorm) {
          stats.processedErrors++;
          this.pushError(stats.errors, rowNumber, 'Email ausente ou inválido.');
          continue;
        }

        const name = this.resolveFullName(row, params.inferred);
        const phone = params.inferred.phoneKey
          ? normalizeText(row[params.inferred.phoneKey])
          : null;
        const sourceRef = `${params.fileHash}:${rowNumber}`;

        try {
          await this.leadsImport.findOrCreateLeadByIdentifiers({
            name,
            email: emailNorm,
            phone,
            sourceSystem: params.sourceSystem.toLowerCase(),
            sourceRef,
            meta: {
              from: 'v2-spreadsheet-job',
              rowNumber,
            },
            utm_campaing: params.tagKey,
          });
          stats.processedOk++;
        } catch (error) {
          stats.processedErrors++;
          const reason = error instanceof Error ? error.message : String(error);
          this.pushError(stats.errors, rowNumber, reason);
        }
      }

      stats.lastProcessedRow = chunkEnd;
      await this.jobRuns.updateProgress({
        id: params.runId,
        lastProcessedRow: stats.lastProcessedRow,
        totalRows: stats.totalRows,
        processedRows: stats.processedRows,
        processedOk: stats.processedOk,
        processedErrors: stats.processedErrors,
        meta: { errors: stats.errors },
      });
    }

    return stats;
  }

  private async recoverStaleRunningRuns(): Promise<void> {
    const staleBefore = new Date(Date.now() - STALE_RUNNING_MINUTES * 60 * 1000);
    const recovered = await this.jobRuns.failStaleRunningRuns({
      jobName: JOB_NAME,
      staleBefore,
      reason: 'Run recuperada após timeout de atualização (stale running).',
    });

    if (recovered > 0) {
      this.logger.warn(`${recovered} run(s) RUNNING marcadas como FAILED para retomada.`);
      return;
    }
    this.logger.debug('Nenhuma run RUNNING stale encontrada neste ciclo.');
  }

  private normalizeSourceSystem(value?: string): 'CLINT' | 'SPREADSHEET' | 'ACTIVECAMPAIGN' | 'FORM' {
    if (!value) return 'SPREADSHEET';
    const normalized = value.trim().toUpperCase();
    if (normalized === 'CLINT') return 'CLINT';
    if (normalized === 'SPREADSHEET') return 'SPREADSHEET';
    if (normalized === 'ACTIVECAMPAIGN') return 'ACTIVECAMPAIGN';
    if (normalized === 'FORM') return 'FORM';
    throw new BadRequestException('sourceSystem inválido para importação de planilha.');
  }

  private resolveTagKey(tagKey: string | undefined, originalName: string): string {
    const tag = (tagKey ?? fileBaseName(originalName)).trim();
    if (!tag) {
      throw new BadRequestException('tagKey inválida. Informe uma tag válida ou nomeie o arquivo.');
    }
    return tag;
  }

  private hashBuffer(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  private getBaseImportsV2Path(): string {
    return join(process.cwd(), 'imports', 'v2');
  }

  private async ensureDir(path: string): Promise<void> {
    await mkdir(path, { recursive: true });
  }

  private async savePendingFile(
    originalName: string,
    fileHash: string,
    buffer: Buffer,
  ): Promise<string> {
    const pendingDir = join(this.getBaseImportsV2Path(), 'pending');
    await this.ensureDir(pendingDir);
    const safeName = this.buildSafeFileName(originalName, fileHash);
    const fullPath = join(pendingDir, safeName);
    await writeFile(fullPath, buffer);
    return fullPath;
  }

  private async moveToProcessing(currentPath: string, runId: string): Promise<string> {
    const processingDir = join(this.getBaseImportsV2Path(), 'processing');
    await this.ensureDir(processingDir);
    const target = join(processingDir, `${runId}_${basename(currentPath)}`);
    await rename(currentPath, target);
    return target;
  }

  private async moveToDone(currentPath: string, runId: string): Promise<string> {
    const doneDir = join(this.getBaseImportsV2Path(), 'done');
    await this.ensureDir(doneDir);
    const target = join(doneDir, `${runId}_${basename(currentPath)}`);
    await rename(currentPath, target);
    return target;
  }

  private async moveToFailed(currentPath: string, runId: string): Promise<string> {
    const failedDir = join(this.getBaseImportsV2Path(), 'failed');
    await this.ensureDir(failedDir);
    const target = join(failedDir, `${runId}_${basename(currentPath)}`);
    await rename(currentPath, target);
    return target;
  }

  private async safeMoveToFailed(currentPath: string, runId: string): Promise<string> {
    try {
      if (await this.fileExists(currentPath)) {
        return await this.moveToFailed(currentPath, runId);
      }
    } catch {
      // noop: fallback para o próprio caminho atual
    }
    return currentPath;
  }

  private resolveMimeTypeFromName(name: string): string {
    const ext = extname(name).toLowerCase();
    if (ext === '.csv') return 'text/csv';
    if (ext === '.xlsx') {
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }
    if (ext === '.xls') return 'application/vnd.ms-excel';
    return 'text/csv';
  }

  private buildSafeFileName(originalName: string, hash: string): string {
    const ext = extname(originalName) || '.csv';
    const base = basename(originalName, ext).replace(/[^a-zA-Z0-9\-_]/g, '_');
    const suffix = randomUUID().slice(0, 8);
    return `${Date.now()}_${base}_${hash.slice(0, 10)}_${suffix}${ext}`;
  }

  private extractErrorsFromMeta(meta: Record<string, unknown> | null | undefined) {
    if (!meta || typeof meta !== 'object') return [] as Array<{ row: number; reason: string }>;
    const errors = meta.errors;
    if (!Array.isArray(errors)) return [] as Array<{ row: number; reason: string }>;
    return errors
      .filter((error) => error && typeof error === 'object')
      .map((error) => {
        const row = Number((error as { row?: unknown }).row);
        const reason = String((error as { reason?: unknown }).reason ?? 'Erro desconhecido');
        return { row: Number.isFinite(row) ? row : 0, reason };
      })
      .slice(0, MAX_ERROR_SAMPLES);
  }

  private pushError(target: Array<{ row: number; reason: string }>, row: number, reason: string) {
    if (target.length >= MAX_ERROR_SAMPLES) return;
    target.push({ row, reason });
  }

  private resolveFullName(
    row: Record<string, unknown>,
    inferred: {
      fullNameKey: string | null;
      nameKey: string | null;
      surnameKey: string | null;
    },
  ): string | null {
    const firstName = inferred.nameKey ? normalizeText(row[inferred.nameKey]) : null;
    const surname = inferred.surnameKey ? normalizeText(row[inferred.surnameKey]) : null;

    if (firstName && surname) {
      return `${firstName} ${surname}`;
    }

    if (inferred.fullNameKey) {
      const value = normalizeText(row[inferred.fullNameKey]);
      if (value) {
        return value;
      }
    }

    return firstName ?? surname;
  }

  private mergeMeta(
    base: Record<string, unknown> | null | undefined,
    extra: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      ...(base ?? {}),
      ...extra,
    };
  }

  private mergeMetaWithPaths(
    base: Record<string, unknown> | null | undefined,
    extraPaths: Record<string, string>,
  ): Record<string, unknown> {
    return this.mergeMeta(base, {
      paths: {
        ...this.extractPathMapFromMeta(base),
        ...extraPaths,
      },
    });
  }

  private extractPathMapFromMeta(
    meta: Record<string, unknown> | null | undefined,
  ): Record<string, string> {
    if (!meta || typeof meta !== 'object') return {};
    const paths = meta.paths;
    if (!paths || typeof paths !== 'object') return {};
    const entries = Object.entries(paths as Record<string, unknown>).filter(
      ([, value]) => typeof value === 'string' && value.length > 0,
    ) as Array<[string, string]>;
    return Object.fromEntries(entries);
  }

  private async resolveCurrentFilePath(run: JobRunV2): Promise<string> {
    const pathCandidates = [
      run.filePath,
      this.extractPathMapFromMeta(run.meta).processingPath,
      this.extractPathMapFromMeta(run.meta).failedPath,
      this.extractPathMapFromMeta(run.meta).pendingPath,
    ].filter((value): value is string => Boolean(value));

    for (const candidate of pathCandidates) {
      if (await this.fileExists(candidate)) {
        return candidate;
      }
    }

    throw new BadRequestException(
      `Arquivo do job ${run.id} não encontrado para retomada. Caminho atual: ${run.filePath}`,
    );
  }

  private isPathInsideDir(filePath: string, dirName: 'pending' | 'processing' | 'done' | 'failed'): boolean {
    const dir = resolve(join(this.getBaseImportsV2Path(), dirName)) + sep;
    return resolve(filePath).startsWith(dir);
  }

  private async fileExists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  private async safeUnlink(path: string): Promise<void> {
    try {
      const failedDir = join(this.getBaseImportsV2Path(), 'failed');
      await this.ensureDir(failedDir);
      const failedPath = join(failedDir, `discarded_${basename(path)}`);
      await rename(path, failedPath);
    } catch {
      // noop
    }
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
