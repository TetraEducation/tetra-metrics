import { Module } from '@nestjs/common';
import { IamModule } from '@/modules/iam/iam.modules';
import { SupabaseModule } from '@/infra/supabase/supabase.module';
import { LeadsModule } from '@/modules/leads/leads.module';
import { WhoAmIQuery } from '@/modules/metrics/application/use-cases/whoami.query';
import { MetricsController } from '@/modules/metrics/interface/http/metrics.controller';
import { AnalyticsController } from '@/modules/metrics/interface/http/analytics.controller';
import { DashboardAnalyticsService } from '@/modules/metrics/application/services/dashboard-analytics.service';
import { SourcesAnalyticsService } from '@/modules/metrics/application/services/sources-analytics.service';
import { FunnelDetailsService } from '@/modules/metrics/application/services/funnel-details.service';
import { HealthScoreService } from '@/modules/metrics/application/services/health-score.service';
import { AlertsService } from '@/modules/metrics/application/services/alerts.service';
import { BottlenecksService } from '@/modules/metrics/application/services/bottlenecks.service';

@Module({
  imports: [IamModule, SupabaseModule, LeadsModule],
  controllers: [MetricsController, AnalyticsController],
  providers: [
    WhoAmIQuery,
    DashboardAnalyticsService,
    SourcesAnalyticsService,
    FunnelDetailsService,
    HealthScoreService,
    AlertsService,
    BottlenecksService,
  ],
})
export class MetricsModule {}
