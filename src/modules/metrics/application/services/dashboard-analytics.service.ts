import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE } from '@/infra/supabase/supabase.provider';
import { FunnelAnalyticsService } from '@/modules/leads/application/services/funnel-analytics.service';
import { AlertsService } from './alerts.service';
import { BottlenecksService } from './bottlenecks.service';
import type { DashboardOverviewResponse, Alert, Bottleneck } from '../dto/analytics.dto';
import type { StageAnalyticsDto } from '@/modules/leads/application/dto/funnel-analytics.dto';

@Injectable()
export class DashboardAnalyticsService {
  private readonly logger = new Logger(DashboardAnalyticsService.name);

  constructor(
    @Inject(SUPABASE) private readonly supabase: SupabaseClient,
    private readonly funnelAnalytics: FunnelAnalyticsService,
    private readonly alertsService: AlertsService,
    private readonly bottlenecksService: BottlenecksService,
  ) {}

  /**
   * Get dashboard overview with aggregated metrics, biggest bottleneck, and critical alerts
   */
  async getDashboardOverview(): Promise<DashboardOverviewResponse> {
    try {
      const analytics = await this.funnelAnalytics.getFunnelAnalytics();

      const summary = {
        totalLeads: analytics.global_stats.total_leads,
        totalActiveDeals: analytics.global_stats.total_active,
        totalWonDeals: analytics.global_stats.total_won,
        totalLostDeals: analytics.global_stats.total_lost,
        overallConversionRate: analytics.global_stats.avg_conversion_rate,
        avgConexaoTime: await this.calculateAvgConexaoTime(analytics),
      };

      const allStages: Array<{
        stage: StageAnalyticsDto;
        source?: string;
        funnelName?: string;
      }> = [];

      for (const funnel of analytics.funnels) {
        for (const stage of funnel.stages) {
          allStages.push({
            stage,
            source: funnel.source_system,
            funnelName: funnel.funnel_name,
          });
        }
      }

      const bottlenecks = this.bottlenecksService.detectBottlenecks(allStages);
      const biggestBottleneck = this.bottlenecksService.getBiggestBottleneck(bottlenecks);

      const alerts: Alert[] = [];

      const sourcesMap = new Map<
        string,
        {
          conversionRate: number;
          totalLeads: number;
          wonDeals: number;
          lostDeals: number;
          avgTime: number;
        }
      >();

      for (const funnel of analytics.funnels) {
        const existing = sourcesMap.get(funnel.source_system) || {
          conversionRate: 0,
          totalLeads: 0,
          wonDeals: 0,
          lostDeals: 0,
          avgTime: 0,
        };

        existing.totalLeads += funnel.total_leads;
        existing.wonDeals += funnel.won_deals;
        existing.lostDeals += funnel.lost_deals;
        existing.conversionRate = funnel.overall_conversion_rate;

        sourcesMap.set(funnel.source_system, existing);
      }

      for (const [source, metrics] of sourcesMap.entries()) {
        const sourceAlerts = this.alertsService.generateAlerts({
          ...metrics,
          source,
        });
        alerts.push(...sourceAlerts);
      }
      
      const stageAlerts = this.alertsService.generateStageAlerts(
        allStages.map((s) => ({
          avg_time_in_stage_hours: s.stage.avg_time_in_stage_hours,
          current_count: s.stage.current_count,
          loss_rate: s.stage.loss_rate,
          source: s.source,
          funnelName: s.funnelName,
          stageName: s.stage.stage_name,
        })),
      );
      alerts.push(...stageAlerts);

      const criticalAlerts = this.alertsService.getCriticalAlerts(alerts);

      return {
        summary,
        biggestBottleneck: biggestBottleneck
          ? {
              source: biggestBottleneck.source,
              funnelName: biggestBottleneck.funnelName,
              stageName: biggestBottleneck.stageName,
              avgTime: biggestBottleneck.avgTime,
              currentCount: biggestBottleneck.currentCount,
              lostCount: biggestBottleneck.lostCount,
            }
          : null,
        criticalAlerts,
      };
    } catch (error) {
      this.logger.error(
        `Error getting dashboard overview: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Calculate average time in "Conexão" stage across all funnels
   * Uses already calculated stage analytics to avoid duplicate queries
   */
  private async calculateAvgConexaoTime(
    analytics: Awaited<ReturnType<typeof this.funnelAnalytics.getFunnelAnalytics>>,
  ): Promise<number> {
    try {
      const conexaoTimes: number[] = [];

      for (const funnel of analytics.funnels) {
        for (const stage of funnel.stages) {
          if (
            stage.stage_name.toLowerCase().includes('conex') &&
            stage.avg_time_in_stage_hours !== null &&
            stage.avg_time_in_stage_hours > 0
          ) {
            conexaoTimes.push(stage.avg_time_in_stage_hours);
          }
        }
      }

      if (conexaoTimes.length === 0) {
        return 0;
      }

      const sum = conexaoTimes.reduce((acc, val) => acc + val, 0);
      return Math.round((sum / conexaoTimes.length) * 100) / 100;
    } catch (error) {
      this.logger.error(
        `Error calculating avg conexao time: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 0;
    }
  }
}
