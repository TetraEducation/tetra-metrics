import { Module } from '@nestjs/common';

import { SupabaseModule } from '@/infra/supabase/supabase.module';
import { LeadsImportService } from '@/modules/leads/application/services/leads-import.service';
import { LeadsConsolidationService } from '@/modules/leads/application/services/leads-consolidation.service';
import { LeadsDetailService } from '@/modules/leads/application/services/leads-detail.service';
import { LeadsExportService } from '@/modules/leads/application/services/leads-export.service';
import { LeadsSearchService } from '@/modules/leads/application/services/leads-search.service';
import { FunnelAnalyticsService } from '@/modules/leads/application/services/funnel-analytics.service';
import { LeadsListingService } from '@/modules/leads/application/services/leads-listing.service';
import { LEADS_REPOSITORY } from '@/modules/leads/application/ports/leads-repository.port';
import { LeadsController } from '@/modules/leads/interface/http/leads.controller';
import { LeadsDetailController } from '@/modules/leads/interface/http/leads-detail.controller';
import { LeadsListingController } from '@/modules/leads/interface/http/leads-listing.controller';
import { SupabaseLeadsRepository } from '@/modules/leads/infra/repositories/supabase-leads.repository';

@Module({
  imports: [SupabaseModule],
  providers: [
    LeadsImportService,
    LeadsConsolidationService,
    LeadsDetailService,
    LeadsExportService,
    LeadsSearchService,
    FunnelAnalyticsService,
    LeadsListingService,
    {
      provide: LEADS_REPOSITORY,
      useClass: SupabaseLeadsRepository,
    },
  ],
  controllers: [LeadsController, LeadsDetailController, LeadsListingController],
  exports: [
    LeadsImportService,
    LeadsConsolidationService,
    LeadsDetailService,
    LeadsExportService,
    LeadsSearchService,
    FunnelAnalyticsService,
    LeadsListingService,
  ],
})
export class LeadsModule {}
