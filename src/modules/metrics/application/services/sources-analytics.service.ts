import { Injectable, Logger } from '@nestjs/common';
import { FunnelAnalyticsService } from '@/modules/leads/application/services/funnel-analytics.service';
import { HealthScoreService } from './health-score.service';
import { AlertsService } from './alerts.service';
import type {
  SourcesListResponse,
  SourceDetailsResponse,
  SourceSummary,
  FunnelSummary,
} from '../dto/analytics.dto';
import type { StageAnalyticsDto } from '@/modules/leads/application/dto/funnel-analytics.dto';

@Injectable()
export class SourcesAnalyticsService {
  private readonly logger = new Logger(SourcesAnalyticsService.name);

  constructor(
    private readonly funnelAnalytics: FunnelAnalyticsService,
    private readonly healthScoreService: HealthScoreService,
    private readonly alertsService: AlertsService,
  ) {}

  /**
   * Get list of sources with summary (without details)
   */
  async getSourcesList(): Promise<SourcesListResponse> {
    try {
      const analytics = await this.funnelAnalytics.getFunnelAnalytics();

      // Group funnels by source_system
      const sourcesMap = new Map<string, SourceSummary>();

      for (const funnel of analytics.funnels) {
        const source = funnel.source_system;

        if (!sourcesMap.has(source)) {
          sourcesMap.set(source, {
            source,
            summary: {
              totalLeads: 0,
              activeDeals: 0,
              wonDeals: 0,
              lostDeals: 0,
              conversionRate: 0,
              avgTime: 0,
              healthScore: 0,
            },
            alertsCount: 0,
            funnelsCount: 0,
          });
        }

        const sourceSummary = sourcesMap.get(source)!;
        sourceSummary.summary.totalLeads += funnel.total_leads;
        sourceSummary.summary.activeDeals += funnel.active_deals;
        sourceSummary.summary.wonDeals += funnel.won_deals;
        sourceSummary.summary.lostDeals += funnel.lost_deals;
        sourceSummary.funnelsCount += 1;
      }

      // Calculate metrics for each source
      const sources: SourceSummary[] = [];

      for (const [source, summary] of sourcesMap.entries()) {
        const totalClosed = summary.summary.wonDeals + summary.summary.lostDeals;
        const conversionRate =
          summary.summary.totalLeads > 0
            ? (summary.summary.wonDeals / summary.summary.totalLeads) * 100
            : 0;

        // Calculate average time (simplified - could be improved)
        const avgTime = await this.calculateAvgTimeForSource(source, analytics.funnels);

        // Calculate loss rate
        const lossRate = totalClosed > 0 ? (summary.summary.lostDeals / totalClosed) * 100 : 0;

        // Calculate health score
        const healthScore = this.healthScoreService.calculateHealthScore(
          conversionRate,
          avgTime,
          lossRate,
        );

        summary.summary.conversionRate = Math.round(conversionRate * 100) / 100;
        summary.summary.avgTime = avgTime;
        summary.summary.healthScore = healthScore;

        // Generate alerts to count them
        const alerts = this.alertsService.generateAlerts({
          conversionRate,
          totalLeads: summary.summary.totalLeads,
          wonDeals: summary.summary.wonDeals,
          lostDeals: summary.summary.lostDeals,
          avgTime,
          source,
        });
        summary.alertsCount = alerts.length;

        sources.push(summary);
      }

      // Sort by health score (worst first)
      sources.sort((a, b) => a.summary.healthScore - b.summary.healthScore);

      return { sources };
    } catch (error) {
      this.logger.error(
        `Error getting sources list: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Get details for a specific source
   */
  async getSourceDetails(
    sourceSystem: string,
    includeStages = false,
  ): Promise<SourceDetailsResponse> {
    try {
      const analytics = await this.funnelAnalytics.getFunnelAnalytics(sourceSystem);

      // Aggregate metrics for the source
      let totalLeads = 0;
      let activeDeals = 0;
      let wonDeals = 0;
      let lostDeals = 0;

      for (const funnel of analytics.funnels) {
        totalLeads += funnel.total_leads;
        activeDeals += funnel.active_deals;
        wonDeals += funnel.won_deals;
        lostDeals += funnel.lost_deals;
      }

      const totalClosed = wonDeals + lostDeals;
      const conversionRate = totalLeads > 0 ? (wonDeals / totalLeads) * 100 : 0;
      const avgTime = await this.calculateAvgTimeForSource(sourceSystem, analytics.funnels);
      const lossRate = totalClosed > 0 ? (lostDeals / totalClosed) * 100 : 0;

      const healthScore = this.healthScoreService.calculateHealthScore(
        conversionRate,
        avgTime,
        lossRate,
      );

      const summary = {
        totalLeads,
        activeDeals,
        wonDeals,
        lostDeals,
        conversionRate: Math.round(conversionRate * 100) / 100,
        avgTime,
        healthScore,
      };

      // Generate alerts
      const alerts = this.alertsService.generateAlerts({
        conversionRate,
        totalLeads,
        wonDeals,
        lostDeals,
        avgTime,
        source: sourceSystem,
      });

      // Add stage alerts if includeStages
      if (includeStages) {
        const allStages: Array<{
          avg_time_in_stage_hours: number | null;
          current_count: number;
          loss_rate: number;
          source?: string;
          funnelName?: string;
          stageName?: string;
        }> = [];

        for (const funnel of analytics.funnels) {
          for (const stage of funnel.stages) {
            allStages.push({
              avg_time_in_stage_hours: stage.avg_time_in_stage_hours,
              current_count: stage.current_count,
              loss_rate: stage.loss_rate,
              source: sourceSystem,
              funnelName: funnel.funnel_name,
              stageName: stage.stage_name,
            });
          }
        }

        const stageAlerts = this.alertsService.generateStageAlerts(allStages);
        alerts.push(...stageAlerts);
      }

      // Build funnels list
      const funnels: FunnelSummary[] = analytics.funnels.map((funnel) => {
        const funnelSummary: FunnelSummary = {
          funnel_id: funnel.funnel_id,
          funnel_name: funnel.funnel_name,
          source_system: funnel.source_system,
          summary: {
            total_leads: funnel.total_leads,
            active_deals: funnel.active_deals,
            won_deals: funnel.won_deals,
            lost_deals: funnel.lost_deals,
            overall_conversion_rate: funnel.overall_conversion_rate,
          },
        };

        if (includeStages) {
          funnelSummary.stages = funnel.stages.map((stage) => this.mapStageToSummary(stage));
        }

        return funnelSummary;
      });

      return {
        source: sourceSystem,
        summary,
        alerts,
        funnels,
      };
    } catch (error) {
      this.logger.error(
        `Error getting source details for ${sourceSystem}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Calculate average time for a source (simplified implementation)
   */
  private async calculateAvgTimeForSource(
    sourceSystem: string,
    funnels: Array<{
      stages: StageAnalyticsDto[];
    }>,
  ): Promise<number> {
    const allTimes: number[] = [];

    for (const funnel of funnels) {
      for (const stage of funnel.stages) {
        if (stage.avg_time_in_stage_hours !== null && stage.avg_time_in_stage_hours > 0) {
          allTimes.push(stage.avg_time_in_stage_hours);
        }
      }
    }

    if (allTimes.length === 0) {
      return 0;
    }

    const sum = allTimes.reduce((acc, val) => acc + val, 0);
    return Math.round((sum / allTimes.length) * 100) / 100;
  }

  /**
   * Map StageAnalyticsDto to StageSummary
   */
  private mapStageToSummary(stage: StageAnalyticsDto) {
    return {
      stage_id: stage.stage_id,
      stage_name: stage.stage_name,
      position: stage.position,
      current_count: stage.current_count,
      total_entries: stage.total_entries,
      avg_time_in_stage_hours: stage.avg_time_in_stage_hours,
      avg_time_in_stage_days: stage.avg_time_in_stage_days,
      conversion_to_next: stage.conversion_to_next,
      loss_rate: stage.loss_rate,
      win_rate: stage.win_rate,
      status_breakdown: stage.status_breakdown,
    };
  }
}
