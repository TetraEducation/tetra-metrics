// Tipos base para Analytics

export interface Alert {
  type: 'high_loss' | 'slow_stage' | 'low_conversion' | 'bottleneck';
  severity: 'critical' | 'warning' | 'info';
  message: string;
  value: string | number;
  source?: string;
  funnelName?: string;
  stageName?: string;
}

export interface Bottleneck {
  source: string;
  funnelName: string;
  stageName: string;
  avgTime: number; // em horas
  currentCount: number;
  lostCount: number;
}

// Dashboard Overview Response
export interface DashboardOverviewResponse {
  summary: {
    totalLeads: number;
    totalActiveDeals: number;
    totalWonDeals: number;
    totalLostDeals: number;
    overallConversionRate: number;
    avgConexaoTime: number; // tempo médio no estágio "Conexão"
  };
  biggestBottleneck: Bottleneck | null;
  criticalAlerts: Alert[];
}

// Sources List Response
export interface SourceSummary {
  source: string;
  summary: {
    totalLeads: number;
    activeDeals: number;
    wonDeals: number;
    lostDeals: number;
    conversionRate: number;
    avgTime: number; // tempo médio em horas
    healthScore: number; // 0-100
  };
  alertsCount: number;
  funnelsCount: number;
}

export interface SourcesListResponse {
  sources: SourceSummary[];
}

// Source Details Response
export interface FunnelSummary {
  funnel_id: string;
  funnel_name: string;
  source_system: string;
  summary: {
    total_leads: number;
    active_deals: number;
    won_deals: number;
    lost_deals: number;
    overall_conversion_rate: number;
  };
  stages?: StageSummary[]; // opcional, só quando includeStages=true
}

export interface StageSummary {
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

export interface SourceDetailsResponse {
  source: string;
  summary: SourceSummary['summary'];
  alerts: Alert[];
  funnels: FunnelSummary[];
}

// Funnel Details Response
export interface FunnelDetailsResponse {
  funnel: {
    funnel_id: string;
    funnel_name: string;
    source_system: string;
    total_leads: number;
    active_deals: number;
    won_deals: number;
    lost_deals: number;
    overall_conversion_rate: number;
    stages: StageSummary[];
    created_at: string;
    last_activity: string | null;
  };
}
