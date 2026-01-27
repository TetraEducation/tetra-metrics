import { Module } from '@nestjs/common';

import { SupabaseModule } from '@/infra/supabase/supabase.module';
import { LeadsImportService } from '@/modules/leads/application/services/leads-import.service';
import { LeadsConsolidationService } from '@/modules/leads/application/services/leads-consolidation.service';
import { LeadsSearchService } from '@/modules/leads/application/services/leads-search.service';
import { FunnelAnalyticsService } from '@/modules/leads/application/services/funnel-analytics.service';
import { LeadsListingService } from '@/modules/leads/application/services/leads-listing.service';
import { LEADS_REPOSITORY } from '@/modules/leads/application/ports/leads-repository.port';
import { LeadsController } from '@/modules/leads/interface/http/leads.controller';
import { LeadsListingController } from '@/modules/leads/interface/http/leads-listing.controller';
import { SupabaseLeadsRepository } from '@/modules/leads/infra/repositories/supabase-leads.repository';

@Module({
  imports: [SupabaseModule],
  providers: [
    LeadsImportService,
    LeadsConsolidationService,
    LeadsSearchService,
    FunnelAnalyticsService,
    LeadsListingService,
    {
      provide: LEADS_REPOSITORY,
      useClass: SupabaseLeadsRepository,
    },
  ],
  controllers: [LeadsController, LeadsListingController],
  exports: [
    LeadsImportService,
    LeadsConsolidationService,
    LeadsSearchService,
    FunnelAnalyticsService,
    LeadsListingService,
  ],
})
export class LeadsModule {}
