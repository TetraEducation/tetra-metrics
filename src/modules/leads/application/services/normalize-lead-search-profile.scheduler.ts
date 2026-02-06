import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { NormalizeLeadSearchProfileUseCase } from '@/modules/leads/application/use-cases/normalize-lead-search-profile.use-case';

const ENABLE_NORMALIZATION_JOB = 'ENABLE_NORMALIZATION_JOB';

@Injectable()
export class NormalizeLeadSearchProfileScheduler {
  private readonly logger = new Logger(NormalizeLeadSearchProfileScheduler.name);

  constructor(private readonly normalizeLeadSearchProfile: NormalizeLeadSearchProfileUseCase) {}

  @Cron(CronExpression.EVERY_12_HOURS)
  async run(): Promise<void> {
    if (process.env[ENABLE_NORMALIZATION_JOB] !== 'true') {
      this.logger.debug(
        `${ENABLE_NORMALIZATION_JOB} diferente de true. Scheduler de normalização desabilitado.`,
      );
      return;
    }

    const result = await this.normalizeLeadSearchProfile.execute({
      batchSize: 500,
      metadata: { trigger: 'scheduler' },
    });

    if (result.skipped) {
      this.logger.warn('Execução automática ignorada pois já existe job em andamento.');
      return;
    }

    this.logger.log(
      `Job de normalização executado com sucesso. processedRows=${result.processedRows}, processedLeads=${result.processedLeads}`,
    );
  }
}
