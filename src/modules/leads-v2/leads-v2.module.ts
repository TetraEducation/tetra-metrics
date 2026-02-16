import { Module } from '@nestjs/common';
import { NestLoggerObservabilityAdapter } from '@/infra/observability/nest-logger.observability-adapter';
import { OBSERVABILITY_ADAPTER } from '@/infra/observability/observability.adapter';
import { PrismaV2Module } from '@/infra/prisma-v2/prisma-v2.module';
import { COLUMN_INFERENCE } from '@/modules/imports/application/ports/column-inference.port';
import { SPREADSHEET_PARSER } from '@/modules/imports/application/ports/spreadsheet-parser.port';
import { SurveyInferenceService } from '@/modules/imports/application/services/survey-inference.service';
import { ColumnInferenceService } from '@/modules/imports/infra/inference/column-inference.service';
import { SpreadsheetParserService } from '@/modules/imports/infra/parser/spreadsheet-parser.service';
import { NORMALIZE_LEAD_SEARCH_PROFILE_PORT } from '@/modules/leads/application/ports/normalize-lead-search-profile.port';
import { NormalizeLeadSearchProfileUseCase } from '@/modules/leads/application/use-cases/normalize-lead-search-profile.use-case';
import { LEADS_V2_JOB_RUNS_REPOSITORY } from '@/modules/leads-v2/application/ports/leads-v2-job-runs.port';
import { LEADS_V2_REPOSITORY } from '@/modules/leads-v2/application/ports/leads-v2-repository.port';
import { LEADS_V2_SEARCH_PROFILE_REPOSITORY } from '@/modules/leads-v2/application/ports/leads-v2-search-profile.port';
import { LeadsV2DetailService } from '@/modules/leads-v2/application/services/leads-v2-detail.service';
import { LeadsV2ExportService } from '@/modules/leads-v2/application/services/leads-v2-export.service';
import { LeadsV2ExportJobsScheduler } from '@/modules/leads-v2/application/services/leads-v2-export-jobs.scheduler';
import { LeadsV2ExportJobsService } from '@/modules/leads-v2/application/services/leads-v2-export-jobs.service';
import { LeadsV2ImportService } from '@/modules/leads-v2/application/services/leads-v2-import.service';
import { LeadsV2ImportOperationsService } from '@/modules/leads-v2/application/services/leads-v2-import-operations.service';
import { LeadsV2ListingService } from '@/modules/leads-v2/application/services/leads-v2-listing.service';
import { LeadsV2NormalizeSearchProfileJobsService } from '@/modules/leads-v2/application/services/leads-v2-normalize-search-profile-jobs.service';
import { LeadsV2SearchService } from '@/modules/leads-v2/application/services/leads-v2-search.service';
import { LeadsV2SpreadsheetJobsScheduler } from '@/modules/leads-v2/application/services/leads-v2-spreadsheet-jobs.scheduler';
import { LeadsV2SpreadsheetJobsService } from '@/modules/leads-v2/application/services/leads-v2-spreadsheet-jobs.service';
import { LeadsV2SurveyIngestionService } from '@/modules/leads-v2/application/services/leads-v2-survey-ingestion.service';
import { LeadsV2SurveySpreadsheetJobsScheduler } from '@/modules/leads-v2/application/services/leads-v2-survey-spreadsheet-jobs.scheduler';
import { LeadsV2SurveySpreadsheetJobsService } from '@/modules/leads-v2/application/services/leads-v2-survey-spreadsheet-jobs.service';
import { ListLeadsV2UseCase } from '@/modules/leads-v2/application/use-cases/list-leads-v2.use-case';
import { NormalizeLeadSearchProfileV2UseCase } from '@/modules/leads-v2/application/use-cases/normalize-lead-search-profile-v2.use-case';
import { PrismaLeadsV2Repository } from '@/modules/leads-v2/infra/repositories/prisma-leads-v2.repository';
import { PrismaLeadsV2JobRunsRepository } from '@/modules/leads-v2/infra/repositories/prisma-leads-v2-job-runs.repository';
import { PrismaLeadsV2SearchProfileRepository } from '@/modules/leads-v2/infra/repositories/prisma-leads-v2-search-profile.repository';
import { PrismaNormalizeLeadSearchProfileV2Repository } from '@/modules/leads-v2/infra/repositories/prisma-normalize-lead-search-profile-v2.repository';
import { ImportOperationsController } from '@/modules/leads-v2/interface/http/import-operations.controller';
import { LeadsV2Controller } from '@/modules/leads-v2/interface/http/leads-v2.controller';

@Module({
  imports: [PrismaV2Module],
  providers: [
    LeadsV2ImportService,
    LeadsV2SearchService,
    LeadsV2DetailService,
    LeadsV2ListingService,
    LeadsV2ExportService,
    LeadsV2SpreadsheetJobsService,
    LeadsV2SpreadsheetJobsScheduler,
    LeadsV2ExportJobsService,
    LeadsV2ExportJobsScheduler,
    LeadsV2ImportOperationsService,
    LeadsV2SurveySpreadsheetJobsService,
    LeadsV2SurveySpreadsheetJobsScheduler,
    LeadsV2SurveyIngestionService,
    LeadsV2NormalizeSearchProfileJobsService,
    ListLeadsV2UseCase,
    NormalizeLeadSearchProfileUseCase,
    NormalizeLeadSearchProfileV2UseCase,
    NestLoggerObservabilityAdapter,
    SurveyInferenceService,
    {
      provide: SPREADSHEET_PARSER,
      useClass: SpreadsheetParserService,
    },
    {
      provide: COLUMN_INFERENCE,
      useClass: ColumnInferenceService,
    },
    {
      provide: LEADS_V2_REPOSITORY,
      useClass: PrismaLeadsV2Repository,
    },
    {
      provide: LEADS_V2_JOB_RUNS_REPOSITORY,
      useClass: PrismaLeadsV2JobRunsRepository,
    },
    {
      provide: LEADS_V2_SEARCH_PROFILE_REPOSITORY,
      useClass: PrismaLeadsV2SearchProfileRepository,
    },
    {
      provide: NORMALIZE_LEAD_SEARCH_PROFILE_PORT,
      useClass: PrismaNormalizeLeadSearchProfileV2Repository,
    },
    {
      provide: OBSERVABILITY_ADAPTER,
      useExisting: NestLoggerObservabilityAdapter,
    },
  ],
  controllers: [LeadsV2Controller, ImportOperationsController],
  exports: [LeadsV2NormalizeSearchProfileJobsService],
})
export class LeadsV2Module {}
