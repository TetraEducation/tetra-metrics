export interface StageAnalyticsDto {
  stage_id: string;
  stage_name: string;
  position: number;
  current_count: number;
  total_entries: number;
  avg_time_in_stage_hours: number | null;
  avg_time_in_stage_days: number | null;
  conversion_to_next: number | null;
  loss_rate: number;
  win_rate: number;
  status_breakdown: {
    open: number;
    won: number;
    lost: number;
  };
}

export interface FunnelAnalyticsDto {
  funnel_id: string;
  funnel_name: string;
  source_system: string;
  total_leads: number;
  active_deals: number;
  won_deals: number;
  lost_deals: number;
  stages: StageAnalyticsDto[];
  overall_conversion_rate: number;
  created_at: string;
  last_activity: string | null;
}

export interface FunnelAnalyticsListDto {
  funnels: FunnelAnalyticsDto[];
  total_funnels: number;
  global_stats: {
    total_leads: number;
    total_active: number;
    total_won: number;
    total_lost: number;
    avg_conversion_rate: number;
  };
}
