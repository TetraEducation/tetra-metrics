import type { LeadsV2JobRunsRepositoryPort } from '@/modules/leads-v2/application/ports/leads-v2-job-runs.port';
import { LeadsV2ImportOperationsService } from '@/modules/leads-v2/application/services/leads-v2-import-operations.service';

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

describe('LeadsV2ImportOperationsService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('mapeia run para shape ImportOperation corretamente', async () => {
    const jobRuns = buildJobRunsMock();
    (jobRuns.findById as jest.Mock).mockResolvedValue({
      id: 'job-1',
      jobName: 'leads_v2_spreadsheet_import',
      status: 'COMPLETED',
      fileName: 'file.csv',
      filePath: '/tmp/file.csv',
      fileHash: 'hash',
      sourceSystem: 'SPREADSHEET',
      tagKey: 'CPB2',
      startedAt: '2026-02-14T10:00:00.000Z',
      finishedAt: '2026-02-14T10:01:00.000Z',
      lastProcessedRow: 100,
      totalRows: 100,
      processedRows: 100,
      processedOk: 90,
      processedErrors: 10,
      retryCount: 1,
      errorMessage: null,
      meta: {
        correlationId: 'corr-1',
        errors: [
          {
            row: 4,
            reason: 'numeric field overflow',
            column: 'Pergunta 3',
            value: '9.999999999999E+30',
            code: 'P2020',
            questionId: 'question-3',
          },
        ],
      },
      createdAt: '2026-02-14T09:59:30.000Z',
      updatedAt: '2026-02-14T10:01:00.000Z',
    });

    const service = new LeadsV2ImportOperationsService(jobRuns);
    const operation = await service.getOperationById('job-1');

    expect(operation).toEqual({
      id: 'job-1',
      status: 'SUCCEEDED',
      progressPercent: 100,
      etaSeconds: null,
      counts: {
        processed: 100,
        created: 90,
        updated: 0,
        skipped: 0,
        failed: 10,
      },
      errors: [
        {
          row: 4,
          reason: 'numeric field overflow',
          column: 'Pergunta 3',
          value: '9.999999999999E+30',
          code: 'P2020',
          questionId: 'question-3',
        },
      ],
      createdAt: '2026-02-14T09:59:30.000Z',
      startedAt: '2026-02-14T10:00:00.000Z',
      finishedAt: '2026-02-14T10:01:00.000Z',
      correlationId: 'corr-1',
      downloadUrl: null,
      expiresAt: null,
    });
  });

  it('expõe downloadUrl e expiresAt para runs de exportação não expiradas', async () => {
    const jobRuns = buildJobRunsMock();
    const futureDate = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    (jobRuns.findById as jest.Mock).mockResolvedValue({
      id: 'job-export-1',
      jobName: 'leads_v2_export_csv',
      status: 'COMPLETED',
      fileName: 'file.csv',
      filePath: '/tmp/file.csv',
      fileHash: 'hash',
      sourceSystem: 'SPREADSHEET',
      tagKey: 'EXPORT',
      startedAt: '2026-02-14T10:00:00.000Z',
      finishedAt: '2026-02-14T10:01:00.000Z',
      lastProcessedRow: 120,
      totalRows: 120,
      processedRows: 120,
      processedOk: 120,
      processedErrors: 0,
      retryCount: 1,
      errorMessage: null,
      meta: {
        downloadUrl: '/v2/leads/exports/job-export-1/download',
        expiresAt: futureDate,
      },
      createdAt: '2026-02-14T09:59:30.000Z',
      updatedAt: '2026-02-14T10:01:00.000Z',
    });

    const service = new LeadsV2ImportOperationsService(jobRuns);
    const operation = await service.getOperationById('job-export-1');

    expect(operation?.downloadUrl).toBe('/v2/leads/exports/job-export-1/download');
    expect(operation?.expiresAt).toBe(futureDate);
  });

  it('retorna null quando operacao nao existe', async () => {
    const jobRuns = buildJobRunsMock();
    (jobRuns.findById as jest.Mock).mockResolvedValue(null);

    const service = new LeadsV2ImportOperationsService(jobRuns);
    await expect(service.getOperationById('missing')).resolves.toBeNull();
  });
});
