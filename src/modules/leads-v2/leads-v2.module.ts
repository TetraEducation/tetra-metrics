import { Module } from '@nestjs/common';
import { PrismaV2Module } from '@/infra/prisma-v2/prisma-v2.module';
import { LEADS_V2_REPOSITORY } from '@/modules/leads-v2/application/ports/leads-v2-repository.port';
import { LEADS_V2_JOB_RUNS_REPOSITORY } from '@/modules/leads-v2/application/ports/leads-v2-job-runs.port';
import { LeadsV2ImportService } from '@/modules/leads-v2/application/services/leads-v2-import.service';
import { LeadsV2DetailService } from '@/modules/leads-v2/application/services/leads-v2-detail.service';
import { LeadsV2SearchService } from '@/modules/leads-v2/application/services/leads-v2-search.service';
import { LeadsV2SpreadsheetJobsService } from '@/modules/leads-v2/application/services/leads-v2-spreadsheet-jobs.service';
import { LeadsV2SpreadsheetJobsScheduler } from '@/modules/leads-v2/application/services/leads-v2-spreadsheet-jobs.scheduler';
import { LeadsV2ImportOperationsService } from '@/modules/leads-v2/application/services/leads-v2-import-operations.service';
import { LeadsV2SurveySpreadsheetJobsService } from '@/modules/leads-v2/application/services/leads-v2-survey-spreadsheet-jobs.service';
import { LeadsV2SurveySpreadsheetJobsScheduler } from '@/modules/leads-v2/application/services/leads-v2-survey-spreadsheet-jobs.scheduler';
import { LeadsV2SurveyIngestionService } from '@/modules/leads-v2/application/services/leads-v2-survey-ingestion.service';
import { PrismaLeadsV2Repository } from '@/modules/leads-v2/infra/repositories/prisma-leads-v2.repository';
import { PrismaLeadsV2JobRunsRepository } from '@/modules/leads-v2/infra/repositories/prisma-leads-v2-job-runs.repository';
import { LeadsV2Controller } from '@/modules/leads-v2/interface/http/leads-v2.controller';
import { ImportOperationsController } from '@/modules/leads-v2/interface/http/import-operations.controller';
import { SpreadsheetParserService } from '@/modules/imports/infra/parser/spreadsheet-parser.service';
import { ColumnInferenceService } from '@/modules/imports/infra/inference/column-inference.service';
import { SurveyInferenceService } from '@/modules/imports/application/services/survey-inference.service';
import { SPREADSHEET_PARSER } from '@/modules/imports/application/ports/spreadsheet-parser.port';
import { COLUMN_INFERENCE } from '@/modules/imports/application/ports/column-inference.port';

@Module({
  imports: [PrismaV2Module],
  providers: [
    LeadsV2ImportService,
    LeadsV2SearchService,
    LeadsV2DetailService,
    LeadsV2SpreadsheetJobsService,
    LeadsV2SpreadsheetJobsScheduler,
    LeadsV2ImportOperationsService,
    LeadsV2SurveySpreadsheetJobsService,
    LeadsV2SurveySpreadsheetJobsScheduler,
    LeadsV2SurveyIngestionService,
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
  ],
  controllers: [LeadsV2Controller, ImportOperationsController],
})
export class LeadsV2Module {}
