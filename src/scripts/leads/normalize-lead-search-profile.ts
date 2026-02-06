import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from '@/app.module';
import { NormalizeLeadSearchProfileUseCase } from '@/modules/leads/application/use-cases/normalize-lead-search-profile.use-case';

const logger = new Logger('NormalizeLeadSearchProfileScript');

function parseNumber(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  if (!Number.isFinite(n)) return null;
  return n;
}

function parseBooleanFlag(params: { argvName: string; envName: string; defaultValue: boolean }): boolean {
  const exact = process.argv.find(
    (v) => v === `--${params.argvName}` || v.startsWith(`--${params.argvName}=`),
  );
  if (exact) {
    if (exact === `--${params.argvName}`) return true;
    const raw = exact.split('=')[1];
    return String(raw).toLowerCase() === 'true';
  }

  const env = process.env[params.envName];
  if (env == null) return params.defaultValue;
  return String(env).toLowerCase() === 'true';
}

function parseBatchSize(): number {
  const arg = process.argv.find((value) => value.startsWith('--batch-size='));
  const fromArg = arg ? parseNumber(arg.split('=')[1]) : null;
  const fromEnv = parseNumber(process.env.NORMALIZE_BATCH_SIZE);
  const raw = fromArg ?? fromEnv ?? 500;
  return Math.max(1, Math.floor(raw));
}

async function run() {
  const batchSize = parseBatchSize();
  const dryRun = parseBooleanFlag({ argvName: 'dry-run', envName: 'NORMALIZE_DRY_RUN', defaultValue: false });
  const fromStart = parseBooleanFlag({
    argvName: 'from-start',
    envName: 'NORMALIZE_FROM_START',
    defaultValue: false,
  });
  const debug = parseBooleanFlag({ argvName: 'debug', envName: 'NORMALIZE_DEBUG', defaultValue: false });

  if (debug) {
    // O repositório usa env para habilitar logs adicionais.
    process.env.NORMALIZE_DEBUG = 'true';
  }

  const ctx = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  try {
    const useCase = ctx.get(NormalizeLeadSearchProfileUseCase, { strict: false });

    const result = await useCase.execute({
      batchSize,
      dryRun,
      fromStart,
      metadata: { trigger: 'manual_script', debug },
    });

    if (result.skipped) {
      logger.warn('Execução ignorada pois já existe job em andamento.');
      return;
    }

    logger.log({
      event: 'normalize_lead_search_profile_completed',
      jobRunId: result.jobRunId,
      resumedFromJobRunId: result.resumedFromJobRunId,
      processedRows: result.processedRows,
      processedLeads: result.processedLeads,
      cursor: result.cursor,
      completionReason: result.completionReason ?? null,
      batchSize,
      dryRun,
      fromStart,
      debug,
    });
  } finally {
    await ctx.close();
  }
}

run().catch((error) => {
  logger.error(`Erro crítico na normalização manual: ${(error as Error).stack}`);
  process.exit(1);
});
