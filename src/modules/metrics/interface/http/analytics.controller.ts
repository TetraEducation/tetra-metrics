import { Controller, Get, Param, Query } from '@nestjs/common';
import { DashboardAnalyticsService } from '@/modules/metrics/application/services/dashboard-analytics.service';
import { SourcesAnalyticsService } from '@/modules/metrics/application/services/sources-analytics.service';
import { FunnelDetailsService } from '@/modules/metrics/application/services/funnel-details.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly dashboardAnalytics: DashboardAnalyticsService,
    private readonly sourcesAnalytics: SourcesAnalyticsService,
    private readonly funnelDetails: FunnelDetailsService,
  ) {}

  /**
   * GET /api/analytics/dashboard/overview
   * Retorna métricas agregadas para o dashboard principal
   */
  @Get('dashboard/overview')
  async getDashboardOverview() {
    return this.dashboardAnalytics.getDashboardOverview();
  }

  /**
   * GET /api/analytics/sources
   * Retorna lista de origens (source systems) com resumo
   */
  @Get('sources')
  async getSourcesList() {
    return this.sourcesAnalytics.getSourcesList();
  }

  /**
   * GET /api/analytics/sources/:sourceSystem
   * Retorna detalhes completos de uma origem específica
   * Query params:
   * - includeStages?: boolean - Se true, retorna stages dos funis (padrão: false)
   */
  @Get('sources/:sourceSystem')
  async getSourceDetails(
    @Param('sourceSystem') sourceSystem: string,
    @Query('includeStages') includeStages?: string,
  ) {
    const includeStagesBool = includeStages === 'true' || includeStages === '1';
    return this.sourcesAnalytics.getSourceDetails(sourceSystem, includeStagesBool);
  }

  /**
   * GET /api/analytics/funnels/:funnelId
   * Retorna um funil específico com todos os estágios
   */
  @Get('funnels/:funnelId')
  async getFunnelDetails(@Param('funnelId') funnelId: string) {
    return this.funnelDetails.getFunnelDetails(funnelId);
  }
}
