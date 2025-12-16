import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from '@/app.module';

const logger = new Logger('LeadsSheetsImporter');

async function run() {
  logger.log('Iniciando importação de leads de planilhas...');

  const ctx = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    // TODO: Implementar lógica de importação
    logger.log('Importação concluída.');
  } catch (error) {
    logger.error(`Erro durante importação: ${(error as Error).message}`);
    throw error;
  } finally {
    await ctx.close();
  }
}

run().catch((error) => {
  logger.error(`Erro crítico: ${(error as Error).stack}`);
  process.exit(1);
});
