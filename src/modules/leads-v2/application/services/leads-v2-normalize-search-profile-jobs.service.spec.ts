import { ConflictException } from '@nestjs/common';
import type {
  JobRunSnapshot,
  NormalizeLeadSearchProfilePort,
} from '@/modules/leads/application/ports/normalize-lead-search-profile.port';
import { NormalizeLeadSearchProfileV2UseCase } from '@/modules/leads-v2/application/use-cases/normalize-lead-search-profile-v2.use-case';
import { LeadsV2NormalizeSearchProfileJobsService } from '@/modules/leads-v2/application/services/leads-v2-normalize-search-profile-jobs.service';

function buildNormalizePortMock(): NormalizeLeadSearchProfilePort {
  return {
    resolveQuestionIdsByNormalizedKeys: jest.fn(),
    readFormAnswersBatch: jest.fn(),
    upsertLeadSearchProfile: jest.fn(),
    findLatestJobRunByStatuses: jest.fn(),
    createJobRun: jest.fn(),
    hasRunningJobRun: jest.fn().mockResolvedValue(false),
    updateJobRunProgress: jest.fn(),
    markJobRunFailed: jest.fn(),
    markJobRunCompleted: jest.fn(),
  };
}

describe('LeadsV2NormalizeSearchProfileJobsService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('retorna conflito quando já existe job em execução', async () => {
    const port = buildNormalizePortMock();
    (port.hasRunningJobRun as jest.Mock).mockResolvedValue(true);
    const normalizeUseCase = {
      execute: jest.fn(),
    } as unknown as NormalizeLeadSearchProfileV2UseCase;
    const service = new LeadsV2NormalizeSearchProfileJobsService(normalizeUseCase, port);

    await expect(service.runManual({ batchSize: 250 })).rejects.toBeInstanceOf(ConflictException);
    expect(normalizeUseCase.execute).not.toHaveBeenCalled();
  });

  it('agenda execução assíncrona com parâmetros normalizados', async () => {
    const port = buildNormalizePortMock();
    const normalizeUseCase = {
      execute: jest.fn().mockResolvedValue({
        skipped: false,
        processedRows: 10,
        processedLeads: 3,
      }),
    } as unknown as NormalizeLeadSearchProfileV2UseCase;
    const service = new LeadsV2NormalizeSearchProfileJobsService(normalizeUseCase, port);

    await service.runManual({ batchSize: 20, dryRun: true, fromStart: true });

    await new Promise((resolve) => setImmediate(resolve));
    expect(normalizeUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        batchSize: 20,
        dryRun: true,
        fromStart: true,
      }),
    );
  });

  it('retorna o último status do run v2', async () => {
    const latest: JobRunSnapshot = {
      id: 'run-1',
      jobName: 'normalize-lead-search-profile-v2',
      status: 'completed',
      cursor: null,
      processedRows: 5,
      processedLeads: 2,
      meta: {},
    };
    const port = buildNormalizePortMock();
    (port.findLatestJobRunByStatuses as jest.Mock).mockResolvedValue(latest);
    const service = new LeadsV2NormalizeSearchProfileJobsService(
      { execute: jest.fn() } as unknown as NormalizeLeadSearchProfileV2UseCase,
      port,
    );

    await expect(service.getLatestRun()).resolves.toEqual(latest);
  });
});
