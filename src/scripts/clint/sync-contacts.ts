import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from '@/app.module';
import { ClintService } from '@/modules/clint/application/services/clint.service';

const logger = new Logger('ClintSync');

async function run() {
  logger.log('Iniciando sincronização de contatos do Clint...');

  const ctx = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const clintService = ctx.get(ClintService, { strict: false });

  try {
    const result = await clintService.syncContacts(200);
    logger.log(
      `Sincronização concluída: ${result.processed}/${result.total} contatos processados em ${result.pages} páginas.`,
    );
  } catch (error) {
    logger.error(`Erro durante sincronização: ${(error as Error).message}`);
    throw error;
  } finally {
    await ctx.close();
  }
}

run().catch((error) => {
  logger.error(`Erro crítico: ${(error as Error).stack}`);
  process.exit(1);
});




