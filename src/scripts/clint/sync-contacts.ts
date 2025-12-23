import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from '@/app.module';
import { ClintSyncService } from '@/modules/clint/application/services/clint-sync.service';

const logger = new Logger('ClintSync');

interface SyncOptions {
  dryRun: boolean;
  skipContacts: boolean;
  skipDeals: boolean;
  onlyContacts: boolean;
  onlyDeals: boolean;
}

function parseArgs(): SyncOptions {
  const args = process.argv.slice(2);

  return {
    dryRun: args.includes('--dry-run'),
    skipContacts: args.includes('--skip-contacts'),
    skipDeals: args.includes('--skip-deals'),
    onlyContacts: args.includes('--only-contacts'),
    onlyDeals: args.includes('--only-deals'),
  };
}

async function run() {
  const options = parseArgs();

  // Validação de flags conflitantes
  if (options.onlyContacts && options.onlyDeals) {
    logger.error('❌ Erro: --only-contacts e --only-deals não podem ser usados juntos');
    process.exit(1);
  }

  if (options.onlyContacts && options.skipContacts) {
    logger.error('❌ Erro: --only-contacts e --skip-contacts não podem ser usados juntos');
    process.exit(1);
  }

  if (options.onlyDeals && options.skipDeals) {
    logger.error('❌ Erro: --only-deals e --skip-deals não podem ser usados juntos');
    process.exit(1);
  }

  // Resolver flags finais
  const finalOptions = {
    dryRun: options.dryRun,
    skipContacts: options.skipContacts || options.onlyDeals,
    skipDeals: options.skipDeals || options.onlyContacts,
  };

  logger.log('🚀 Iniciando sincronização do Clint...');
  logger.log(
    `📋 Opções: dryRun=${finalOptions.dryRun}, skipContacts=${finalOptions.skipContacts}, skipDeals=${finalOptions.skipDeals}`,
  );

  const ctx = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  const clintSyncService = ctx.get(ClintSyncService, { strict: false });

  try {
    const report = await clintSyncService.run(finalOptions);

    logger.log('');
    logger.log('═══════════════════════════════════════════════');
    logger.log('✅ SINCRONIZAÇÃO CONCLUÍDA');
    logger.log('═══════════════════════════════════════════════');
    logger.log(`📊 TOTAIS:`);
    logger.log(`   Tags: ${report.totals.tags}`);
    logger.log(`   Origins: ${report.totals.origins}`);
    logger.log(`   Contatos processados: ${report.totals.contacts}`);
    logger.log(`   Contatos ignorados (sem email): ${report.totals.contactsIgnoredNoEmail}`);
    logger.log(`   Leads criados/atualizados: ${report.totals.leadsUpserted}`);
    logger.log(`   Lead tags vinculadas: ${report.totals.leadTagsLinked}`);
    logger.log(`   Funnel entries criadas/atualizadas: ${report.totals.funnelEntriesUpserted}`);

    if (report.warnings.length > 0) {
      logger.warn('');
      logger.warn('⚠️  AVISOS:');
      for (const warning of report.warnings) {
        logger.warn(`   ${warning}`);
      }
    }

    if (report.errors.length > 0) {
      logger.error('');
      logger.error('❌ ERROS:');
      for (const error of report.errors) {
        logger.error(
          `   [${error.type}] ${error.error} (status: ${error.status}, page: ${error.page}, HTTP: ${error.statusCode})`,
        );
      }
    }

    logger.log('═══════════════════════════════════════════════');
  } catch (error) {
    logger.error(`❌ Erro durante sincronização: ${(error as Error).message}`);
    logger.error((error as Error).stack);
    throw error;
  } finally {
    await ctx.close();
  }
}

run().catch((error) => {
  logger.error(`❌ Erro crítico: ${(error as Error).stack}`);
  process.exit(1);
});
