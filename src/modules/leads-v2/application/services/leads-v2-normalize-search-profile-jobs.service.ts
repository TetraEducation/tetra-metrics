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
