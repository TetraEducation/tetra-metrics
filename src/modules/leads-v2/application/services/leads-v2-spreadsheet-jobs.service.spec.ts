import type { ColumnInferencePort } from '@/modules/imports/application/ports/column-inference.port';
import type { SpreadsheetParserPort } from '@/modules/imports/application/ports/spreadsheet-parser.port';
import { access, mkdir, mkdtemp, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type {
  JobRunV2,
  LeadsV2JobRunsRepositoryPort,
} from '@/modules/leads-v2/application/ports/leads-v2-job-runs.port';
import { LeadsV2ImportService } from '@/modules/leads-v2/application/services/leads-v2-import.service';
import { LeadsV2SpreadsheetJobsService } from '@/modules/leads-v2/application/services/leads-v2-spreadsheet-jobs.service';

const buildJobRunsMock = (): LeadsV2JobRunsRepositoryPort => ({
  createPending: jest.fn(),
  hasBlockingRunByHash: jest.fn(),
  claimNextRunnable: jest.fn(),
  findById: jest.fn(),
  hasRunning: jest.fn(),
  list: jest.fn(),
  updateFilePath: jest.fn().mockResolvedValue(undefined),
  markCompleted: jest.fn(),
  markFailed: jest.fn(),
  markPendingForRetry: jest.fn(),
  updateProgress: jest.fn().mockResolvedValue(undefined),
  failStaleRunningRuns: jest.fn().mockResolvedValue(0),
});

const buildLeadsImportMock = () => ({
  findOrCreateLeadByIdentifiers: jest.fn().mockResolvedValue({
    lead: { id: 'lead_test', name: 'lead', createdAt: new Date().toISOString() },
    created: true,
    phoneIgnoredDueToConflict: false,
  }),
});

describe('LeadsV2SpreadsheetJobsService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('combina nome + sobrenome mesmo quando fullNameKey aponta para Nome', async () => {
    const jobRuns = buildJobRunsMock();
    const parser = {} as SpreadsheetParserPort;
    const infer = {} as ColumnInferencePort;
    const leadsImport = buildLeadsImportMock();

    const service = new LeadsV2SpreadsheetJobsService(
      jobRuns,
      parser,
      infer,
      leadsImport as unknown as LeadsV2ImportService,
    );

    await (service as any).processRows({
      runId: 'run-1',
      rows: [
        {
          email: 'maria@example.com',
          Nome: 'Maria',
          Sobrenome: 'Silva',
        },
      ],
      inferred: {
        emailKey: 'email',
        fullNameKey: 'Nome',
        nameKey: 'Nome',
        surnameKey: 'Sobrenome',
        phoneKey: null,
      },
      startFromRow: 1,
      sourceSystem: 'SPREADSHEET',
      tagKey: 'campanha',
      fileHash: 'hash123',
      existingStats: { processedRows: 0, processedOk: 0, processedErrors: 0 },
      existingErrors: [],
    });

    expect(leadsImport.findOrCreateLeadByIdentifiers).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Maria Silva',
      }),
    );
  });

  it('executa recuperação de RUNNING stale antes de buscar próximo job', async () => {
    const jobRuns = buildJobRunsMock();
    (jobRuns.claimNextRunnable as jest.Mock).mockResolvedValue(null);

    const service = new LeadsV2SpreadsheetJobsService(
      jobRuns,
      {} as SpreadsheetParserPort,
      {} as ColumnInferencePort,
      buildLeadsImportMock() as unknown as LeadsV2ImportService,
    );

    await service.processNextPendingRun();

    expect(jobRuns.failStaleRunningRuns).toHaveBeenCalledTimes(1);
    expect(jobRuns.claimNextRunnable).toHaveBeenCalledTimes(1);
  });

  it('retoma arquivo por processingPath quando filePath não existe mais', async () => {
    const workDir = await mkdtemp(join(tmpdir(), 'v2-jobs-'));
    const processingPath = join(workDir, 'processing_file.csv');
    await writeFile(processingPath, 'email\nana@example.com\n');

    const run = {
      id: 'run_1',
      filePath: join(workDir, 'pending_file.csv'),
      meta: {
        paths: {
          processingPath,
        },
      },
    } as unknown as JobRunV2;

    const service = new LeadsV2SpreadsheetJobsService(
      buildJobRunsMock(),
      {} as SpreadsheetParserPort,
      {} as ColumnInferencePort,
      buildLeadsImportMock() as unknown as LeadsV2ImportService,
    );

    const resolved = await (service as any).resolveCurrentFilePath(run);
    expect(resolved).toBe(processingPath);
  });

  it('continua processamento a partir do checkpoint sem reprocessar linhas anteriores', async () => {
    const jobRuns = buildJobRunsMock();
    const leadsImport = buildLeadsImportMock();

    const service = new LeadsV2SpreadsheetJobsService(
      jobRuns,
      {} as SpreadsheetParserPort,
      {} as ColumnInferencePort,
      leadsImport as unknown as LeadsV2ImportService,
    );

    await (service as any).processRows({
      runId: 'run-checkpoint',
      rows: [
        { email: 'a1@example.com', Nome: 'A1', Sobrenome: 'Teste' },
        { email: 'a2@example.com', Nome: 'A2', Sobrenome: 'Teste' },
        { email: 'a3@example.com', Nome: 'A3', Sobrenome: 'Teste' },
      ],
      inferred: {
        emailKey: 'email',
        fullNameKey: 'Nome',
        nameKey: 'Nome',
        surnameKey: 'Sobrenome',
        phoneKey: null,
      },
      startFromRow: 3,
      sourceSystem: 'SPREADSHEET',
      tagKey: 'CPB2',
      fileHash: 'hash123',
      existingStats: { processedRows: 2, processedOk: 2, processedErrors: 0 },
      existingErrors: [],
    });

    expect(leadsImport.findOrCreateLeadByIdentifiers).toHaveBeenCalledTimes(1);
    expect(jobRuns.updateProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'run-checkpoint',
        lastProcessedRow: 3,
        processedRows: 3,
        processedOk: 3,
      }),
    );
  });

  it('bloqueia novo upload quando hash possui run bloqueante', async () => {
    const jobRuns = buildJobRunsMock();
    (jobRuns.hasBlockingRunByHash as jest.Mock).mockResolvedValue(true);
    const service = new LeadsV2SpreadsheetJobsService(
      jobRuns,
      {} as SpreadsheetParserPort,
      {} as ColumnInferencePort,
      buildLeadsImportMock() as unknown as LeadsV2ImportService,
    );

    await expect(
      service.queueSpreadsheet({
        file: {
          originalname: 'leads.csv',
          mimetype: 'text/csv',
          buffer: Buffer.from('email\nana@example.com\n', 'utf-8'),
          size: 22,
        } as Express.Multer.File,
      }),
    ).rejects.toThrow('Este arquivo já foi registrado anteriormente para processamento.');
    expect(jobRuns.createPending).not.toHaveBeenCalled();
  });

  it('permite novo upload quando não há run bloqueante', async () => {
    const jobRuns = buildJobRunsMock();
    (jobRuns.hasBlockingRunByHash as jest.Mock).mockResolvedValue(false);
    (jobRuns.createPending as jest.Mock).mockResolvedValue({
      id: 'job-1',
      status: 'PENDING',
    });
    const service = new LeadsV2SpreadsheetJobsService(
      jobRuns,
      {} as SpreadsheetParserPort,
      {} as ColumnInferencePort,
      buildLeadsImportMock() as unknown as LeadsV2ImportService,
    );
    const workDir = await mkdtemp(join(tmpdir(), 'v2-jobs-queue-'));
    const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(workDir);

    const queued = await service.queueSpreadsheet({
      file: {
        originalname: 'leads.csv',
        mimetype: 'text/csv',
        buffer: Buffer.from('email\nana@example.com\n', 'utf-8'),
        size: 22,
      } as Express.Multer.File,
    });

    expect(queued).toEqual({
      jobRunId: 'job-1',
      status: 'PENDING',
    });
    expect(jobRuns.createPending).toHaveBeenCalledTimes(1);
    cwdSpy.mockRestore();
  });

  it('limpa arquivo físico de run COMPLETED mantendo registro no banco', async () => {
    const jobRuns = buildJobRunsMock();
    (jobRuns.findById as jest.Mock).mockResolvedValue({
      id: 'run_cleanup',
      jobName: 'leads_v2_spreadsheet_import',
      status: 'COMPLETED',
    });
    const service = new LeadsV2SpreadsheetJobsService(
      jobRuns,
      {} as SpreadsheetParserPort,
      {} as ColumnInferencePort,
      buildLeadsImportMock() as unknown as LeadsV2ImportService,
    );
    const baseDir = await mkdtemp(join(tmpdir(), 'v2-jobs-cleanup-'));
    const doneDir = join(baseDir, 'imports', 'v2', 'done');
    await mkdir(doneDir, { recursive: true });
    const donePath = join(doneDir, 'run_cleanup_leads.csv');
    await writeFile(donePath, 'email\nana@example.com\n', 'utf-8');
    const expiredDate = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
    await utimes(donePath, expiredDate, expiredDate);
    const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(baseDir);

    const result = await service.cleanupCompletedFiles(3);

    expect(result.deleted).toBe(1);
    await expect(access(donePath)).rejects.toBeTruthy();
    cwdSpy.mockRestore();
  });
});
