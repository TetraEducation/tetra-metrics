import { access, mkdtemp, mkdir, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { LeadsV2JobRunsRepositoryPort } from '@/modules/leads-v2/application/ports/leads-v2-job-runs.port';
import { LeadsV2ExportJobsService } from '@/modules/leads-v2/application/services/leads-v2-export-jobs.service';
import { LeadsV2ExportService } from '@/modules/leads-v2/application/services/leads-v2-export.service';

const buildJobRunsMock = (): LeadsV2JobRunsRepositoryPort => ({
  createPending: jest.fn(),
  hasBlockingRunByHash: jest.fn(),
  claimNextRunnable: jest.fn(),
  findById: jest.fn(),
  hasRunning: jest.fn(),
  list: jest.fn(),
  updateFilePath: jest.fn(),
  markCompleted: jest.fn(),
  markFailed: jest.fn(),
  markPendingForRetry: jest.fn(),
  updateProgress: jest.fn(),
  failStaleRunningRuns: jest.fn(),
});

describe('LeadsV2ExportJobsService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('enfileira exportação e retorna operationId', async () => {
    const jobRuns = buildJobRunsMock();
    (jobRuns.createPending as jest.Mock).mockResolvedValue({
      id: 'job-export-1',
      status: 'PENDING',
    });
    const service = new LeadsV2ExportJobsService(
      jobRuns,
      { exportLeadsToFile: jest.fn() } as unknown as LeadsV2ExportService,
    );

    const queued = await service.queueExport({ email: 'lead@example.com' });

    expect(queued).toEqual({
      operationId: 'job-export-1',
      status: 'PENDING',
    });
    expect(jobRuns.createPending).toHaveBeenCalledTimes(1);
  });

  it('processa run pendente em lotes e atualiza progresso', async () => {
    const jobRuns = buildJobRunsMock();
    (jobRuns.failStaleRunningRuns as jest.Mock).mockResolvedValue(0);
    (jobRuns.claimNextRunnable as jest.Mock).mockResolvedValue({
      id: 'job-export-1',
      jobName: 'leads_v2_export_csv',
      status: 'RUNNING',
      fileName: 'leads-export-1.csv',
      filePath: '',
      fileHash: 'hash',
      sourceSystem: 'SPREADSHEET',
      tagKey: 'EXPORT',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      lastProcessedRow: 0,
      totalRows: null,
      processedRows: 0,
      processedOk: 0,
      processedErrors: 0,
      retryCount: 1,
      errorMessage: null,
      meta: { filters: { email: 'lead@example.com' } },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const exportLeadsToFile = jest.fn().mockImplementation(async (_filters, _path, options) => {
      await options.onProgress({
        totalRows: 3,
        lastProcessedRow: 2,
        processedRows: 2,
        processedOk: 2,
        processedErrors: 0,
      });
      await options.onProgress({
        totalRows: 3,
        lastProcessedRow: 3,
        processedRows: 3,
        processedOk: 3,
        processedErrors: 0,
      });
      return {
        totalRows: 3,
        lastProcessedRow: 3,
        processedRows: 3,
        processedOk: 3,
        processedErrors: 0,
      };
    });

    const service = new LeadsV2ExportJobsService(
      jobRuns,
      { exportLeadsToFile } as unknown as LeadsV2ExportService,
    );

    await service.processNextPendingRun();

    expect(exportLeadsToFile).toHaveBeenCalledTimes(1);
    expect(jobRuns.updateProgress).toHaveBeenCalledTimes(2);
    expect(jobRuns.updateFilePath).toHaveBeenCalledTimes(1);
    expect(jobRuns.markCompleted).toHaveBeenCalledWith(
      'job-export-1',
      expect.objectContaining({
        totalRows: 3,
        processedRows: 3,
        processedOk: 3,
        processedErrors: 0,
      }),
    );
  });

  it('marca como FAILED e remove arquivo parcial quando export falha', async () => {
    const jobRuns = buildJobRunsMock();
    (jobRuns.failStaleRunningRuns as jest.Mock).mockResolvedValue(0);
    (jobRuns.claimNextRunnable as jest.Mock).mockResolvedValue({
      id: 'job-export-fail',
      jobName: 'leads_v2_export_csv',
      status: 'RUNNING',
      fileName: 'leads-export-fail.csv',
      filePath: '',
      fileHash: 'hash',
      sourceSystem: 'SPREADSHEET',
      tagKey: 'EXPORT',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      lastProcessedRow: 0,
      totalRows: null,
      processedRows: 0,
      processedOk: 0,
      processedErrors: 0,
      retryCount: 1,
      errorMessage: null,
      meta: { filters: {} },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const exportLeadsToFile = jest.fn().mockImplementation(async (_filters, path: string) => {
      await writeFile(path, 'nome,email\n', 'utf-8');
      throw new Error('falha na exportacao');
    });

    const service = new LeadsV2ExportJobsService(
      jobRuns,
      { exportLeadsToFile } as unknown as LeadsV2ExportService,
    );
    const baseDir = await mkdtemp(join(tmpdir(), 'v2-export-fail-'));
    const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(baseDir);

    await service.processNextPendingRun();

    const expectedPath = join(baseDir, 'imports', 'v2', 'exports', 'job-export-fail_leads-export.csv');
    await expect(access(expectedPath)).rejects.toBeTruthy();
    expect(jobRuns.markFailed).toHaveBeenCalledWith(
      'job-export-fail',
      expect.objectContaining({
        errorMessage: 'falha na exportacao',
      }),
    );
    cwdSpy.mockRestore();
  });

  it('remove arquivos expirados da pasta de exports', async () => {
    const jobRuns = buildJobRunsMock();
    const service = new LeadsV2ExportJobsService(
      jobRuns,
      { exportLeadsToFile: jest.fn() } as unknown as LeadsV2ExportService,
    );
    const baseDir = await mkdtemp(join(tmpdir(), 'v2-export-cleanup-'));
    const exportsDir = join(baseDir, 'imports', 'v2', 'exports');
    await mkdir(exportsDir, { recursive: true });
    const expiredFilePath = join(exportsDir, 'expired.csv');
    await writeFile(expiredFilePath, 'a,b\n1,2\n', 'utf-8');
    const expiredDate = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
    await utimes(expiredFilePath, expiredDate, expiredDate);
    const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(baseDir);

    const result = await service.cleanupExpiredExports();

    expect(result.deleted).toBe(1);
    cwdSpy.mockRestore();
  });
});
