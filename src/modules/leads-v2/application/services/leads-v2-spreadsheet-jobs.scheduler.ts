import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LeadsV2SpreadsheetJobsService } from '@/modules/leads-v2/application/services/leads-v2-spreadsheet-jobs.service';

const ENABLE_V2_SPREADSHEET_JOB = 'ENABLE_V2_SPREADSHEET_JOB';

@Injectable()
export class LeadsV2SpreadsheetJobsScheduler implements OnModuleInit {
  private readonly logger = new Logger(LeadsV2SpreadsheetJobsScheduler.name);
  private isRunningTick = false;
  private hasLoggedDisabled = false;

  constructor(private readonly jobsService: LeadsV2SpreadsheetJobsService) {}

  async onModuleInit(): Promise<void> {
    await this.runPollingCycle('startup');
  }

  @Cron('*/20 * * * * *')
  async runPollingCycle(trigger: 'cron' | 'startup' = 'cron'): Promise<void> {
    if (!this.isSchedulerEnabled()) {
      if (!this.hasLoggedDisabled || trigger === 'startup') {
        this.logger.warn(
          `${ENABLE_V2_SPREADSHEET_JOB} está desabilitada. Polling de importação de planilhas v2 não será executado.`,
        );
        this.hasLoggedDisabled = true;
      }
      return;
    }
    this.hasLoggedDisabled = false;

    if (this.isRunningTick) {
      this.logger.warn('Polling anterior ainda em execução. Ignorando este ciclo.');
      return;
    }

    this.isRunningTick = true;
    try {
      await this.jobsService.processNextPendingRun();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Falha no ciclo de polling (${trigger}): ${reason}`);
    } finally {
      this.isRunningTick = false;
    }
  }

  private isSchedulerEnabled(): boolean {
    return process.env[ENABLE_V2_SPREADSHEET_JOB] === 'true';
  }
}
