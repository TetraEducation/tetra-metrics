import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LeadsV2ExportJobsService } from '@/modules/leads-v2/application/services/leads-v2-export-jobs.service';

const ENABLE_V2_EXPORT_JOB = 'ENABLE_V2_EXPORT_JOB';
const ENABLE_V2_EXPORT_CLEANUP = 'ENABLE_V2_EXPORT_CLEANUP';

@Injectable()
export class LeadsV2ExportJobsScheduler implements OnModuleInit {
  private readonly logger = new Logger(LeadsV2ExportJobsScheduler.name);
  private isRunningTick = false;

  constructor(private readonly exportJobs: LeadsV2ExportJobsService) {}

  async onModuleInit(): Promise<void> {
    await this.runPollingCycle('startup');
  }

  @Cron('*/20 * * * * *')
  async runPollingCycle(trigger: 'cron' | 'startup' = 'cron'): Promise<void> {
    if (!this.isEnabled(ENABLE_V2_EXPORT_JOB)) {
      if (trigger === 'startup') {
        this.logger.warn(
          `${ENABLE_V2_EXPORT_JOB} está desabilitada. Polling de exportação v2 não será executado.`,
        );
      }
      return;
    }

    if (this.isRunningTick) {
      this.logger.warn('Polling de exportação ainda em execução. Ignorando ciclo atual.');
      return;
    }

    this.isRunningTick = true;
    try {
      await this.exportJobs.processNextPendingRun();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Falha no polling de exportação (${trigger}): ${reason}`);
    } finally {
      this.isRunningTick = false;
    }
  }

  @Cron('0 3 * * *')
  async runDailyCleanup(): Promise<void> {
    if (!this.isEnabled(ENABLE_V2_EXPORT_CLEANUP)) {
      return;
    }
    try {
      const result = await this.exportJobs.cleanupExpiredExports();
      if (result.deleted > 0) {
        this.logger.log(`Limpeza de exports: ${result.deleted} arquivo(s) removido(s).`);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Falha na limpeza diária de exports: ${reason}`);
    }
  }

  private isEnabled(key: string): boolean {
    return process.env[key] === 'true';
  }
}
