import { Module } from '@nestjs/common';
import { NestLoggerObservabilityAdapter } from '@/infra/observability/nest-logger.observability-adapter';
import { OBSERVABILITY_ADAPTER } from '@/infra/observability/observability.adapter';
import { NORMALIZE_LEAD_SEARCH_PROFILE_PORT } from '@/modules/leads/application/ports/normalize-lead-search-profile.port';
import { SupabaseLeadSearchProfileRepository } from '@/modules/leads/infra/repositories/supabase-lead-search-profile.repository';
import { SupabaseModule } from '@/infra/supabase/supabase.module';
import { LEADS_REPOSITORY } from '@/modules/leads/application/ports/leads-repository.port';
import { FunnelAnalyticsService } from '@/modules/leads/application/services/funnel-analytics.service';
import { LeadsConsolidationService } from '@/modules/leads/application/services/leads-consolidation.service';
import { LeadsDetailService } from '@/modules/leads/application/services/leads-detail.service';
import { LeadsImportService } from '@/modules/leads/application/services/leads-import.service';
import { LeadsSearchService } from '@/modules/leads/application/services/leads-search.service';
import { NormalizeLeadSearchProfileScheduler } from '@/modules/leads/application/services/normalize-lead-search-profile.scheduler';
import { NormalizeLeadSearchProfileUseCase } from '@/modules/leads/application/use-cases/normalize-lead-search-profile.use-case';
import { SupabaseLeadsRepository } from '@/modules/leads/infra/repositories/supabase-leads.repository';
import { SupabaseNormalizeLeadSearchProfileRepository } from '@/modules/leads/infra/repositories/supabase-normalize-lead-search-profile.repository';
import { LeadsController } from '@/modules/leads/interface/http/leads.controller';
import { LeadsDetailController } from '@/modules/leads/interface/http/leads-detail.controller';
import { LeadsV2Module } from '@/modules/leads-v2/leads-v2.module';

@Module({
  imports: [SupabaseModule, LeadsV2Module],
  providers: [
    LeadsImportService,
    LeadsConsolidationService,
    LeadsDetailService,
    LeadsSearchService,
    FunnelAnalyticsService,
    NormalizeLeadSearchProfileUseCase,
    NormalizeLeadSearchProfileScheduler,
    SupabaseLeadSearchProfileRepository,
    NestLoggerObservabilityAdapter,
    {
      provide: NORMALIZE_LEAD_SEARCH_PROFILE_PORT,
      useClass: SupabaseNormalizeLeadSearchProfileRepository,
    },
    {
      provide: OBSERVABILITY_ADAPTER,
      useExisting: NestLoggerObservabilityAdapter,
    },
    {
      provide: LEADS_REPOSITORY,
      useClass: SupabaseLeadsRepository,
    },
  ],
  controllers: [LeadsController, LeadsDetailController],
  exports: [
    LeadsImportService,
    LeadsConsolidationService,
    LeadsDetailService,
    LeadsSearchService,
    FunnelAnalyticsService,
    NormalizeLeadSearchProfileUseCase,
    NormalizeLeadSearchProfileScheduler,
  ],
})
export class LeadsModule {}
