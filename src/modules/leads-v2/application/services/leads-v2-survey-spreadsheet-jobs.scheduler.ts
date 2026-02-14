import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LeadsV2SurveySpreadsheetJobsService } from '@/modules/leads-v2/application/services/leads-v2-survey-spreadsheet-jobs.service';

const ENABLE_V2_SPREADSHEET_JOB = 'ENABLE_V2_SPREADSHEET_JOB';

@Injectable()
export class LeadsV2SurveySpreadsheetJobsScheduler implements OnModuleInit {
  private readonly logger = new Logger(LeadsV2SurveySpreadsheetJobsScheduler.name);
  private isRunningTick = false;
  private hasLoggedDisabled = false;

  constructor(private readonly jobsService: LeadsV2SurveySpreadsheetJobsService) {}

  async onModuleInit(): Promise<void> {
    await this.runPollingCycle('startup');
  }

  @Cron('*/20 * * * * *')
  async runPollingCycle(trigger: 'cron' | 'startup' = 'cron'): Promise<void> {
    if (!this.isSchedulerEnabled()) {
      if (!this.hasLoggedDisabled || trigger === 'startup') {
        this.logger.warn(
          `${ENABLE_V2_SPREADSHEET_JOB} está desabilitada. Polling de importação de surveys v2 não será executado.`,
        );
        this.hasLoggedDisabled = true;
      }
      return;
    }
    this.hasLoggedDisabled = false;

    if (this.isRunningTick) {
      this.logger.warn('Polling anterior de surveys ainda em execução. Ignorando este ciclo.');
      return;
    }

    this.isRunningTick = true;
    try {
      await this.jobsService.processNextPendingRun();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Falha no ciclo de polling de surveys (${trigger}): ${reason}`);
    } finally {
      this.isRunningTick = false;
    }
  }

  private isSchedulerEnabled(): boolean {
    return process.env[ENABLE_V2_SPREADSHEET_JOB] === 'true';
  }
}
