import {
  ConflictException,
  Controller,
  Body,
  Get,
  HttpCode,
  Logger,
  Post,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';

// biome-ignore lint/style/useImportType: NestJS DI precisa da referência em tempo de execução
import { JobRunsService } from '@/modules/leads/application/services/job-runs.service';
// biome-ignore lint/style/useImportType: NestJS DI precisa da referência em tempo de execução
import { NormalizeLeadSearchProfileUseCase } from '@/modules/leads/application/use-cases/normalize-lead-search-profile.use-case';
import {
  LeadsJobRunsQueryDto,
  RunNormalizeLeadSearchProfileDto,
} from '@/modules/leads/interface/http/leads-jobs.dto';

const NORMALIZE_JOB_NAME = 'normalize-lead-search-profile';

@Controller('leads/jobs')
export class LeadsJobsController {
  private readonly logger = new Logger(LeadsJobsController.name);

  constructor(
    private readonly jobRuns: JobRunsService,
    private readonly normalizeLeadSearchProfile: NormalizeLeadSearchProfileUseCase,
  ) {}

  @Get('runs')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  )
  async listRuns(@Query() query: LeadsJobRunsQueryDto) {
    return this.jobRuns.listJobRuns({
      jobName: query.jobName,
      status: query.status,
      limit: Math.min(100, Math.max(1, query.limit ?? 20)),
    });
  }

  @Post('normalize-lead-search-profile/run')
  @HttpCode(202)
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  )
  async runNormalizeLeadSearchProfile(@Body() body: RunNormalizeLeadSearchProfileDto) {
    const alreadyRunning = await this.jobRuns.hasRunningJob(NORMALIZE_JOB_NAME);
    if (alreadyRunning) {
      throw new ConflictException('Já existe uma execução em andamento para este job.');
    }

    const batchSize = Math.min(5000, Math.max(1, body.batchSize ?? 500));
    const dryRun = body.dryRun ?? false;
    const fromStart = body.fromStart ?? false;

    setImmediate(() => {
      void this.normalizeLeadSearchProfile
        .execute({
          batchSize,
          dryRun,
          fromStart,
          metadata: { trigger: 'manual_api', fromStart, dryRun, batchSize },
        })
        .then((result) => {
          if (result.skipped) {
            this.logger.warn('Disparo manual ignorado: job já estava em andamento (race).');
            return;
          }

          this.logger.log(
            `Job de normalização executado (manual). processedRows=${result.processedRows}, processedLeads=${result.processedLeads}`,
          );
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(`Falha ao executar job manualmente: ${message}`, error);
        });
    });

    return { accepted: true };
  }
}

