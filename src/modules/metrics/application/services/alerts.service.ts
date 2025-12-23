import { Injectable } from '@nestjs/common';
import type { Alert } from '../dto/analytics.dto';

interface SourceMetrics {
  conversionRate: number;
  totalLeads: number;
  wonDeals: number;
  lostDeals: number;
  avgTime: number;
  source?: string;
}

interface StageMetrics {
  avg_time_in_stage_hours: number | null;
  current_count: number;
  loss_rate: number;
  source?: string;
  funnelName?: string;
  stageName?: string;
}

@Injectable()
export class AlertsService {
  /**
   * Gera alertas para uma origem/fonte
   */
  generateAlerts(metrics: SourceMetrics): Alert[] {
    const alerts: Alert[] = [];

    if (metrics.conversionRate < 10 && metrics.totalLeads > 50) {
      alerts.push({
        type: 'low_conversion',
        severity: 'critical',
        message: 'Taxa de conversão muito baixa',
        value: `${metrics.conversionRate.toFixed(1)}%`,
        source: metrics.source,
      });
    } else if (metrics.conversionRate < 20 && metrics.totalLeads > 50) {
      alerts.push({
        type: 'low_conversion',
        severity: 'warning',
        message: 'Taxa de conversão abaixo do ideal',
        value: `${metrics.conversionRate.toFixed(1)}%`,
        source: metrics.source,
      });
    }

    const totalClosed = metrics.wonDeals + metrics.lostDeals;
    if (totalClosed > 10) {
      const lossRate = (metrics.lostDeals / totalClosed) * 100;
      if (lossRate > 50) {
        alerts.push({
          type: 'high_loss',
          severity: 'critical',
          message: 'Taxa de perda elevada',
          value: `${lossRate.toFixed(1)}%`,
          source: metrics.source,
        });
      } else if (lossRate > 30) {
        alerts.push({
          type: 'high_loss',
          severity: 'warning',
          message: 'Taxa de perda acima do ideal',
          value: `${lossRate.toFixed(1)}%`,
          source: metrics.source,
        });
      }
    }

    return alerts;
  }

  /**
   * Gera alertas para stages (gargalos)
   */
  generateStageAlerts(stages: StageMetrics[]): Alert[] {
    const alerts: Alert[] = [];

    for (const stage of stages) {
      if (
        stage.avg_time_in_stage_hours !== null &&
        stage.avg_time_in_stage_hours > 96 &&
        stage.current_count > 5
      ) {
        const days = Math.round((stage.avg_time_in_stage_hours / 24) * 10) / 10;
        alerts.push({
          type: 'slow_stage',
          severity: stage.avg_time_in_stage_hours > 168 ? 'critical' : 'warning',
          message: 'Stage com tempo médio muito alto',
          value: `${days} dias`,
          source: stage.source,
          funnelName: stage.funnelName,
          stageName: stage.stageName,
        });
      }

      if (stage.loss_rate > 30 && stage.current_count > 5) {
        alerts.push({
          type: 'high_loss',
          severity: stage.loss_rate > 50 ? 'critical' : 'warning',
          message: 'Stage com alta taxa de perda',
          value: `${stage.loss_rate.toFixed(1)}%`,
          source: stage.source,
          funnelName: stage.funnelName,
          stageName: stage.stageName,
        });
      }
    }

    return alerts;
  }

  /**
   * Filtra apenas alertas críticos
   */
  getCriticalAlerts(alerts: Alert[]): Alert[] {
    return alerts.filter((alert) => alert.severity === 'critical');
  }
}
