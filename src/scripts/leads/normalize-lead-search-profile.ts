import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from '@/app.module';
import { NormalizeLeadSearchProfileUseCase } from '@/modules/leads/application/use-cases/normalize-lead-search-profile.use-case';

const logger = new Logger('NormalizeLeadSearchProfileScript');

function parseBatchSize(): number {
  const arg = process.argv.find((value) => value.startsWith('--batch-size='));
  if (!arg) return 500;

  const parsed = Number(arg.split('=')[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) return 500;

  return Math.floor(parsed);
}

async function run() {
  const batchSize = parseBatchSize();

  const ctx = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  try {
    const useCase = ctx.get(NormalizeLeadSearchProfileUseCase, { strict: false });

    const result = await useCase.execute({
      batchSize,
      metadata: { trigger: 'manual_script' },
    });

    if (result.skipped) {
      logger.warn('Execução ignorada pois já existe job em andamento.');
      return;
    }

    logger.log(
      `Normalização concluída. jobRunId=${result.jobRunId}, processedRows=${result.processedRows}, processedLeads=${result.processedLeads}`,
    );
  } finally {
    await ctx.close();
  }
}

run().catch((error) => {
  logger.error(`Erro crítico na normalização manual: ${(error as Error).stack}`);
  process.exit(1);
});
