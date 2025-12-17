import { Module } from '@nestjs/common';
import { SupabaseModule } from '@/infra/supabase/supabase.module';
import { ImportsController } from '@/modules/imports/interface/http/imports.controller';
import { ImportsService } from '@/modules/imports/application/services/imports.service';
import { SpreadsheetParserService } from '@/modules/imports/infra/parser/spreadsheet-parser.service';
import { ColumnInferenceService } from '@/modules/imports/infra/inference/column-inference.service';
import { SPREADSHEET_PARSER } from '@/modules/imports/application/ports/spreadsheet-parser.port';
import { COLUMN_INFERENCE } from '@/modules/imports/application/ports/column-inference.port';

@Module({
  imports: [SupabaseModule],
  controllers: [ImportsController],
  providers: [
    ImportsService,
    {
      provide: SPREADSHEET_PARSER,
      useClass: SpreadsheetParserService,
    },
    {
      provide: COLUMN_INFERENCE,
      useClass: ColumnInferenceService,
    },
  ],
  exports: [ImportsService],
})
export class ImportsModule {}


