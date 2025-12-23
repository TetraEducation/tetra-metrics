import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE } from '@/infra/supabase/supabase.provider';
import { FunnelAnalyticsService } from '@/modules/leads/application/services/funnel-analytics.service';
import type { FunnelDetailsResponse } from '../dto/analytics.dto';

@Injectable()
export class FunnelDetailsService {
  private readonly logger = new Logger(FunnelDetailsService.name);

  constructor(
    @Inject(SUPABASE) private readonly supabase: SupabaseClient,
    private readonly funnelAnalytics: FunnelAnalyticsService,
  ) {}

  /**
   * Get details for a specific funnel by ID
   */
  async getFunnelDetails(funnelId: string): Promise<FunnelDetailsResponse> {
    try {
      // Get funnel info
      const { data: funnel, error: funnelError } = await this.supabase
        .from('funnels')
        .select('id, name')
        .eq('id', funnelId)
        .single();

      if (funnelError || !funnel) {
        throw new NotFoundException(`Funnel with ID ${funnelId} not found`);
      }

      // Get source system from alias
      const { data: alias } = await this.supabase
        .from('funnel_aliases')
        .select('source_system')
        .eq('funnel_id', funnelId)
        .maybeSingle();

      const sourceSystem = alias?.source_system ?? 'unknown';

      // Use the existing analytics service by getting all and filtering
      // TODO: Could be optimized by adding a public method to FunnelAnalyticsService
      const analytics = await this.funnelAnalytics.getFunnelAnalytics(sourceSystem);
      const funnelData = analytics.funnels.find((f) => f.funnel_id === funnelId);

      if (!funnelData) {
        throw new NotFoundException(`Funnel analytics not found for ID ${funnelId}`);
      }

      return {
        funnel: {
          funnel_id: funnelData.funnel_id,
          funnel_name: funnelData.funnel_name,
          source_system: funnelData.source_system,
          total_leads: funnelData.total_leads,
          active_deals: funnelData.active_deals,
          won_deals: funnelData.won_deals,
          lost_deals: funnelData.lost_deals,
          overall_conversion_rate: funnelData.overall_conversion_rate,
          stages: funnelData.stages.map((stage) => ({
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
          })),
          created_at: funnelData.created_at,
          last_activity: funnelData.last_activity,
        },
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Error getting funnel details for ${funnelId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
