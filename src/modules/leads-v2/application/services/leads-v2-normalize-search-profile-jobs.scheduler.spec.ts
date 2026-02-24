import { LeadsV2NormalizeSearchProfileJobsScheduler } from '@/modules/leads-v2/application/services/leads-v2-normalize-search-profile-jobs.scheduler';
import { LeadsV2NormalizeSearchProfileJobsService } from '@/modules/leads-v2/application/services/leads-v2-normalize-search-profile-jobs.service';

describe('LeadsV2NormalizeSearchProfileJobsScheduler', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    delete process.env.ENABLE_V2_NORMALIZE_SEARCH_PROFILE_JOB;
  });

  it('agenda o ciclo de startup sem bloquear o onModuleInit', () => {
    process.env.ENABLE_V2_NORMALIZE_SEARCH_PROFILE_JOB = 'true';
    const jobsService = {
      processRecoveryCycle: jest.fn().mockResolvedValue(undefined),
    } as unknown as LeadsV2NormalizeSearchProfileJobsService;
    const scheduler = new LeadsV2NormalizeSearchProfileJobsScheduler(jobsService);

    scheduler.onModuleInit();
    expect(jobsService.processRecoveryCycle).not.toHaveBeenCalled();

    jest.runOnlyPendingTimers();
    expect(jobsService.processRecoveryCycle).toHaveBeenCalledWith('startup');
  });

  it('evita overlap entre ciclos quando já existe polling em execução', async () => {
    process.env.ENABLE_V2_NORMALIZE_SEARCH_PROFILE_JOB = 'true';
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const jobsService = {
      processRecoveryCycle: jest.fn().mockReturnValue(pending),
    } as unknown as LeadsV2NormalizeSearchProfileJobsService;
    const scheduler = new LeadsV2NormalizeSearchProfileJobsScheduler(jobsService);
    const warnSpy = jest.spyOn((scheduler as any).logger, 'warn').mockImplementation();

    const firstCycle = scheduler.runPollingCycle('cron');
    await Promise.resolve();

    await scheduler.runPollingCycle('cron');
    expect(jobsService.processRecoveryCycle).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      'Ciclo de retomada da normalização v2 ainda em execução. Ignorando ciclo atual.',
    );

    release();
    await firstCycle;
  });

  it('loga erro de recovery sem propagar exceção', async () => {
    process.env.ENABLE_V2_NORMALIZE_SEARCH_PROFILE_JOB = 'true';
    const jobsService = {
      processRecoveryCycle: jest.fn().mockRejectedValue(new Error('boom')),
    } as unknown as LeadsV2NormalizeSearchProfileJobsService;
    const scheduler = new LeadsV2NormalizeSearchProfileJobsScheduler(jobsService);
    const errorSpy = jest.spyOn((scheduler as any).logger, 'error').mockImplementation();

    await expect(scheduler.runPollingCycle('startup')).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      'Falha no ciclo de retomada da normalização v2 (startup): boom',
    );
  });
});
