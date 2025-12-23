export interface StageAnalyticsDto {
  stage_id: string;
  stage_name: string;
  position: number;
  current_count: number; // Deals (entries) atualmente neste stage
  total_entries: number; // Total de deals (entries) únicos que já passaram por este stage
  avg_time_in_stage_hours: number | null; // Tempo médio que deals ficam neste stage
  avg_time_in_stage_days: number | null; // Tempo médio em dias (para exibição)
  conversion_to_next: number | null; // % de deals que avançam para o próximo stage
  loss_rate: number; // % de deals perdidos neste stage (lost / total_entries)
  win_rate: number; // % de deals ganhos neste stage (won / total_entries)
  status_breakdown: {
    open: number; // Deals abertos
    won: number; // Deals ganhos
    lost: number; // Deals perdidos
  };
}

export interface FunnelAnalyticsDto {
  funnel_id: string;
  funnel_name: string;
  source_system: string;
  total_leads: number; // Leads únicos (um lead pode ter múltiplos deals)
  active_deals: number; // Deals com status = 'open'
  won_deals: number; // Deals com status = 'won'
  lost_deals: number; // Deals com status = 'lost'
  stages: StageAnalyticsDto[];
  overall_conversion_rate: number; // % de won_deals / total_leads (taxa de conversão de leads)
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
