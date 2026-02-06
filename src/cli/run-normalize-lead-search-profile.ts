import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { NormalizeLeadSearchProfileUseCase } from '../modules/leads/application/use-cases/normalize-lead-search-profile.use-case';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  const useCase = app.get(NormalizeLeadSearchProfileUseCase);

  const batchSize = Number(process.env.NORMALIZE_BATCH_SIZE ?? 5000);
  const dryRun = String(process.env.NORMALIZE_DRY_RUN ?? 'false') === 'true';

  await useCase.execute({ batchSize, dryRun });

  await app.close();
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
