import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from '@/app.module';
import { ActiveCampaignService } from '@/modules/activecampaign/application/services/activecampaign.service';

const logger = new Logger('ActiveCampaignSync');

async function run() {
  logger.log('Iniciando sincronização de contatos do ActiveCampaign...');

  const ctx = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const activeCampaignService = ctx.get(ActiveCampaignService, { strict: false });

  try {
    // TODO: Implementar chamada de sincronização
    logger.log('Sincronização concluída.');
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
