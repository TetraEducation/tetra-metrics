import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';

import { SUPABASE } from '@/infra/supabase/supabase.provider';
import type {
  FunnelAnalyticsDto,
  FunnelAnalyticsListDto,
  StageAnalyticsDto,
} from '@/modules/leads/application/dto/funnel-analytics.dto';

@Injectable()
export class FunnelAnalyticsService {
  private readonly logger = new Logger(FunnelAnalyticsService.name);

  constructor(@Inject(SUPABASE) private readonly supabase: SupabaseClient) {}

  /**
   * Get analytics for all funnels with stage breakdown and bottleneck identification
   */
  async getFunnelAnalytics(sourceSystem?: string): Promise<FunnelAnalyticsListDto> {
    const funnelsQuery = this.supabase
      .from('funnels')
      .select('id, key, name, created_at')
      .order('name', { ascending: true });

    const { data: funnels, error: funnelsError } = await funnelsQuery;

    if (funnelsError) {
      this.logger.error(`Error fetching funnels: ${funnelsError.message}`);
      throw funnelsError;
    }

    if (!funnels || funnels.length === 0) {
      return {
        funnels: [],
        total_funnels: 0,
        global_stats: {
          total_leads: 0,
          total_active: 0,
          total_won: 0,
          total_lost: 0,
          avg_conversion_rate: 0,
        },
      };
    }

    const { data: aliases, error: aliasesError } = await this.supabase
      .from('funnel_aliases')
      .select('funnel_id, source_system, source_key')
      .in(
        'funnel_id',
        funnels.map((f) => f.id),
      );

    if (aliasesError) {
      this.logger.error(`Error fetching funnel aliases: ${aliasesError.message}`);
    }

    const aliasMap = new Map<string, { source_system: string; source_key: string }>();
    (aliases ?? []).forEach((a) => {
      aliasMap.set(a.funnel_id, {
        source_system: a.source_system,
        source_key: a.source_key,
      });
    });

    const funnelAnalytics: FunnelAnalyticsDto[] = [];
    let globalTotalLeads = 0;
    let globalTotalActive = 0;
    let globalTotalWon = 0;
    let globalTotalLost = 0;

    for (const funnel of funnels) {
      const alias = aliasMap.get(funnel.id);

      if (sourceSystem && alias?.source_system !== sourceSystem) {
        continue;
      }

      const analytics = await this.analyzeFunnel(
        funnel.id,
        funnel.name,
        alias?.source_system ?? 'unknown',
      );

      if (analytics) {
        funnelAnalytics.push(analytics);
        globalTotalLeads += analytics.total_leads;
        globalTotalActive += analytics.active_deals;
        globalTotalWon += analytics.won_deals;
        globalTotalLost += analytics.lost_deals;
      }
    }

    const avgConversionRate = globalTotalLeads > 0 ? (globalTotalWon / globalTotalLeads) * 100 : 0;

    return {
      funnels: funnelAnalytics,
      total_funnels: funnelAnalytics.length,
      global_stats: {
        total_leads: globalTotalLeads,
        total_active: globalTotalActive,
        total_won: globalTotalWon,
        total_lost: globalTotalLost,
        avg_conversion_rate: Math.round(avgConversionRate * 100) / 100,
      },
    };
  }

  /**
   * Analyze a single funnel with detailed stage metrics
   */
  private async analyzeFunnel(
    funnelId: string,
    funnelName: string,
    sourceSystem: string,
  ): Promise<FunnelAnalyticsDto | null> {
    try {
      const { data: entries, error: entriesError } = await this.supabase
        .from('lead_funnel_entries')
        .select('id, lead_id, current_stage_id, status, first_seen_at, last_seen_at')
        .eq('funnel_id', funnelId);

      if (entriesError) {
        this.logger.error(`Error fetching entries for funnel ${funnelId}: ${entriesError.message}`);
        return null;
      }

      if (!entries || entries.length === 0) {
        return {
          funnel_id: funnelId,
          funnel_name: funnelName,
          source_system: sourceSystem,
          total_leads: 0,
          active_deals: 0,
          won_deals: 0,
          lost_deals: 0,
          stages: [],
          overall_conversion_rate: 0,
          created_at: new Date().toISOString(),
          last_activity: null,
        };
      }

      const uniqueLeadIds = new Set(entries.map((e) => e.lead_id));
      const totalLeads = uniqueLeadIds.size;

      const activeDeals = entries.filter((e) => e.status === 'open').length;
      const wonDeals = entries.filter((e) => e.status === 'won').length;
      const lostDeals = entries.filter((e) => e.status === 'lost').length;

      const { data: stages, error: stagesError } = await this.supabase
        .from('funnel_stages')
        .select('id, key, name, position')
        .eq('funnel_id', funnelId)
        .order('position', { ascending: true });

      if (stagesError) {
        this.logger.error(`Error fetching stages for funnel ${funnelId}: ${stagesError.message}`);
      }

      const stageAnalytics: StageAnalyticsDto[] = [];
      const sortedStages = (stages ?? []).sort((a, b) => a.position - b.position);

      for (let i = 0; i < sortedStages.length; i++) {
        const stage = sortedStages[i];
        const nextStage = i < sortedStages.length - 1 ? sortedStages[i + 1] : null;

        const stageStats = await this.analyzeStage(
          stage.id,
          stage.name,
          stage.position,
          nextStage?.id ?? null,
          entries,
        );

        if (stageStats) {
          stageAnalytics.push(stageStats);
        }
      }

      const lastActivity = entries.reduce<string | null>((latest, entry) => {
        if (!latest) return entry.last_seen_at;
        return entry.last_seen_at > latest ? entry.last_seen_at : latest;
      }, null);

      const conversionRate = totalLeads > 0 ? (wonDeals / totalLeads) * 100 : 0;

      return {
        funnel_id: funnelId,
        funnel_name: funnelName,
        source_system: sourceSystem,
        total_leads: totalLeads,
        active_deals: activeDeals,
        won_deals: wonDeals,
        lost_deals: lostDeals,
        stages: stageAnalytics,
        overall_conversion_rate: Math.round(conversionRate * 100) / 100,
        created_at: entries[0]?.first_seen_at ?? new Date().toISOString(),
        last_activity: lastActivity,
      };
    } catch (error) {
      this.logger.error(
        `Error analyzing funnel ${funnelId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Analyze a single stage with transition metrics
   */
  private async analyzeStage(
    stageId: string,
    stageName: string,
    position: number,
    nextStageId: string | null,
    entries: Array<{
      id: string;
      current_stage_id: string | null;
      status: string;
    }>,
  ): Promise<StageAnalyticsDto | null> {
    try {
      const currentInStage = entries.filter((e) => e.current_stage_id === stageId);
      const currentCount = currentInStage.length;

      const openCount = currentInStage.filter((e) => e.status === 'open').length;
      const wonCount = currentInStage.filter((e) => e.status === 'won').length;
      const lostCount = currentInStage.filter((e) => e.status === 'lost').length;

      const { data: transitionsTo, error: transitionsToError } = await this.supabase
        .from('lead_funnel_transitions')
        .select('id, lead_funnel_entry_id, occurred_at')
        .eq('to_stage_id', stageId);

      if (transitionsToError) {
        this.logger.error(
          `Error fetching transitions to stage ${stageId}: ${transitionsToError.message}`,
        );
      }

      const uniqueEntryIdsInTransitions = new Set(
        transitionsTo?.map((t) => t.lead_funnel_entry_id) ?? [],
      );

      const totalEntries =
        uniqueEntryIdsInTransitions.size > 0 ? uniqueEntryIdsInTransitions.size : currentCount;

      const { data: transitionsFrom, error: transitionsFromError } = await this.supabase
        .from('lead_funnel_transitions')
        .select('id, lead_funnel_entry_id, from_stage_id, to_stage_id, occurred_at')
        .eq('from_stage_id', stageId);

      if (transitionsFromError) {
        this.logger.error(
          `Error fetching transitions from stage ${stageId}: ${transitionsFromError.message}`,
        );
      }

      let avgTimeInStageHours: number | null = null;
      if (transitionsTo && transitionsFrom && transitionsTo.length > 0) {
        const timeDiffs: number[] = [];

        for (const transTo of transitionsTo) {
          const transFrom = transitionsFrom.find(
            (tf) => tf.lead_funnel_entry_id === transTo.lead_funnel_entry_id,
          );
          if (transFrom) {
            const timeInMs =
              new Date(transFrom.occurred_at).getTime() - new Date(transTo.occurred_at).getTime();
            const timeInHours = timeInMs / (1000 * 60 * 60);
            if (timeInHours >= 0) {
              timeDiffs.push(timeInHours);
            }
          }
        }

        if (timeDiffs.length > 0) {
          const sum = timeDiffs.reduce((acc, val) => acc + val, 0);
          avgTimeInStageHours = Math.round((sum / timeDiffs.length) * 100) / 100;
        }
      }

      let conversionToNext: number | null = null;
      if (nextStageId && transitionsFrom) {
        const transitionsToNext = transitionsFrom.filter((t) => t.to_stage_id === nextStageId);
        const totalExits = transitionsFrom.length;
        if (totalExits > 0) {
          conversionToNext = Math.round((transitionsToNext.length / totalExits) * 10000) / 100;
        }
      }

      const lossRate = totalEntries > 0 ? Math.round((lostCount / totalEntries) * 10000) / 100 : 0;

      const winRate = totalEntries > 0 ? Math.round((wonCount / totalEntries) * 10000) / 100 : 0;

      const avgTimeInStageDays =
        avgTimeInStageHours !== null ? Math.round((avgTimeInStageHours / 24) * 100) / 100 : null;

      return {
        stage_id: stageId,
        stage_name: stageName,
        position,
        current_count: currentCount,
        total_entries: totalEntries,
        avg_time_in_stage_hours: avgTimeInStageHours,
        avg_time_in_stage_days: avgTimeInStageDays,
        conversion_to_next: conversionToNext,
        loss_rate: lossRate,
        win_rate: winRate,
        status_breakdown: {
          open: openCount,
          won: wonCount,
          lost: lostCount,
        },
      };
    } catch (error) {
      this.logger.error(
        `Error analyzing stage ${stageId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
}
