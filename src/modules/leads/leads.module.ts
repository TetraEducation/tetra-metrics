import { Module } from '@nestjs/common';

import { SupabaseModule } from '@/infra/supabase/supabase.module';
import { LeadsImportService } from '@/modules/leads/application/services/leads-import.service';
import { LeadsConsolidationService } from '@/modules/leads/application/services/leads-consolidation.service';
import { LEADS_REPOSITORY } from '@/modules/leads/application/ports/leads-repository.port';
import { LeadsController } from '@/modules/leads/interface/http/leads.controller';
import { SupabaseLeadsRepository } from '@/modules/leads/infra/repositories/supabase-leads.repository';

@Module({
  imports: [SupabaseModule],
  providers: [
    LeadsImportService,
    LeadsConsolidationService,
    {
      provide: LEADS_REPOSITORY,
      useClass: SupabaseLeadsRepository,
    },
  ],
  controllers: [LeadsController],
  exports: [LeadsImportService, LeadsConsolidationService],
})
export class LeadsModule {}




