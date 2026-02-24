import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import {
  NORMALIZE_LEAD_SEARCH_PROFILE_PORT,
  type JobRunSnapshot,
  type NormalizeLeadSearchProfilePort,
} from '@/modules/leads/application/ports/normalize-lead-search-profile.port';
import {
  NORMALIZE_LEAD_SEARCH_PROFILE_V2_JOB_NAME,
  NormalizeLeadSearchProfileV2UseCase,
} from '@/modules/leads-v2/application/use-cases/normalize-lead-search-profile-v2.use-case';

const STALE_RUNNING_MINUTES = 5;
const AUTO_RECOVERY_BATCH_SIZE = 500;

export type QueueNormalizeSearchProfileV2Input = {
  batchSize?: number;
  dryRun?: boolean;
  fromStart?: boolean;
};

@Injectable()
export class LeadsV2NormalizeSearchProfileJobsService {
  private readonly logger = new Logger(LeadsV2NormalizeSearchProfileJobsService.name);

  constructor(
    private readonly normalizeUseCase: NormalizeLeadSearchProfileV2UseCase,
    @Inject(NORMALIZE_LEAD_SEARCH_PROFILE_PORT)
    private readonly normalizePort: NormalizeLeadSearchProfilePort,
  ) {}

  async processRecoveryCycle(trigger: 'cron' | 'startup' = 'cron'): Promise<void> {
    const recovered = await this.normalizePort.failStaleRunningJobRuns({
      jobName: NORMALIZE_LEAD_SEARCH_PROFILE_V2_JOB_NAME,
      staleBefore: new Date(Date.now() - STALE_RUNNING_MINUTES * 60 * 1000),
      reason: 'Run recuperada automaticamente após restart/timeout de atualização.',
    });

    if (recovered <= 0) {
      this.logger.debug(
        `Nenhuma execução RUNNING stale para normalização v2 no ciclo ${trigger}.`,
      );
      return;
    }

    this.logger.warn(
      `${recovered} run(s) RUNNING stale da normalização v2 marcadas como FAILED para retomada.`,
    );

    const alreadyRunning = await this.normalizePort.hasRunningJobRun(
      NORMALIZE_LEAD_SEARCH_PROFILE_V2_JOB_NAME,
    );
    if (alreadyRunning) {
      this.logger.warn(
        'Ainda existe run RUNNING após recuperação stale; retomada automática será tentada no próximo ciclo.',
      );
      return;
    }

    const result = await this.normalizeUseCase.execute({
      batchSize: AUTO_RECOVERY_BATCH_SIZE,
      dryRun: false,
      fromStart: false,
      metadata: {
        trigger: `auto_recovery_${trigger}`,
        recoveredRuns: recovered,
      },
    });

    if (result.skipped) {
      this.logger.warn('Retomada automática da normalização v2 ignorada: lock/race detectado.');
      return;
    }

    this.logger.log(
      `Retomada automática da normalização v2 concluída. processedRows=${result.processedRows}, processedLeads=${result.processedLeads}`,
    );
  }

  async runManual(input: QueueNormalizeSearchProfileV2Input) {
    const alreadyRunning = await this.normalizePort.hasRunningJobRun(
      NORMALIZE_LEAD_SEARCH_PROFILE_V2_JOB_NAME,
    );
    if (alreadyRunning) {
      throw new ConflictException('Ja existe uma execucao em andamento para este job.');
    }

    const batchSize = Math.min(5000, Math.max(1, input.batchSize ?? 500));
    const dryRun = input.dryRun ?? false;
    const fromStart = input.fromStart ?? false;

    setImmediate(() => {
      void this.normalizeUseCase
        .execute({
          batchSize,
          dryRun,
          fromStart,
          metadata: { trigger: 'manual_api_v2', fromStart, dryRun, batchSize },
        })
        .then((result) => {
          if (result.skipped) {
            this.logger.warn('Disparo manual v2 ignorado: job ja estava em andamento (race).');
            return;
          }
          this.logger.log(
            `Job v2 de normalizacao executado. processedRows=${result.processedRows}, processedLeads=${result.processedLeads}`,
          );
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(`Falha ao executar job v2 manualmente: ${message}`, error);
        });
    });

    return { accepted: true };
  }

  async getLatestRun(): Promise<JobRunSnapshot | null> {
    return this.normalizePort.findLatestJobRunByStatuses({
      jobName: NORMALIZE_LEAD_SEARCH_PROFILE_V2_JOB_NAME,
      statuses: ['running', 'failed', 'completed'],
    });
  }
}
