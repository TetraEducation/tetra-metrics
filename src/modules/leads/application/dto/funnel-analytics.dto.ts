export interface StageAnalyticsDto {
  stage_id: string;
  stage_name: string;
  position: number;
  current_count: number; // Leads atualmente neste stage
  total_entries: number; // Total de leads que já passaram por este stage
  avg_time_in_stage_hours: number | null; // Tempo médio que leads ficam neste stage
  conversion_to_next: number | null; // % de leads que avançam para o próximo stage
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
  active_deals: number; // status = 'open'
  won_deals: number;
  lost_deals: number;
  stages: StageAnalyticsDto[];
  overall_conversion_rate: number; // % de won / total
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

