import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LeadsV2NormalizeSearchProfileJobsService } from '@/modules/leads-v2/application/services/leads-v2-normalize-search-profile-jobs.service';

const ENABLE_V2_NORMALIZE_SEARCH_PROFILE_JOB = 'ENABLE_V2_NORMALIZE_SEARCH_PROFILE_JOB';

@Injectable()
export class LeadsV2NormalizeSearchProfileJobsScheduler implements OnModuleInit {
  private readonly logger = new Logger(LeadsV2NormalizeSearchProfileJobsScheduler.name);
  private isRunningTick = false;
  private hasLoggedDisabled = false;

  constructor(private readonly jobsService: LeadsV2NormalizeSearchProfileJobsService) {}

  async onModuleInit(): Promise<void> {
    await this.runPollingCycle('startup');
  }

  @Cron('*/20 * * * * *')
  async runPollingCycle(trigger: 'cron' | 'startup' = 'cron'): Promise<void> {
    if (!this.isSchedulerEnabled()) {
      if (!this.hasLoggedDisabled || trigger === 'startup') {
        this.logger.warn(
          `${ENABLE_V2_NORMALIZE_SEARCH_PROFILE_JOB} está desabilitada. Retomada automática da normalização v2 não será executada.`,
        );
        this.hasLoggedDisabled = true;
      }
      return;
    }
    this.hasLoggedDisabled = false;

    if (this.isRunningTick) {
      this.logger.warn('Ciclo de retomada da normalização v2 ainda em execução. Ignorando ciclo atual.');
      return;
    }

    this.isRunningTick = true;
    try {
      await this.jobsService.processRecoveryCycle(trigger);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Falha no ciclo de retomada da normalização v2 (${trigger}): ${reason}`);
    } finally {
      this.isRunningTick = false;
    }
  }

  private isSchedulerEnabled(): boolean {
    return process.env[ENABLE_V2_NORMALIZE_SEARCH_PROFILE_JOB] === 'true';
  }
}
