import { Injectable } from '@nestjs/common';
import type { Bottleneck } from '../dto/analytics.dto';
import type { StageAnalyticsDto } from '@/modules/leads/application/dto/funnel-analytics.dto';

interface StageWithContext {
  stage: StageAnalyticsDto;
  source?: string;
  funnelName?: string;
}

@Injectable()
export class BottlenecksService {
  /**
   * Detecta gargalos (bottlenecks) baseado em stages
   * Um bottleneck é um stage onde:
   * - Tempo médio > 96 horas (4 dias)
   * - Tem mais de 5 deals atualmente
   */
  detectBottlenecks(stages: StageWithContext[]): Bottleneck[] {
    const bottlenecks: Bottleneck[] = [];

    for (const { stage, source, funnelName } of stages) {
      if (
        stage.avg_time_in_stage_hours !== null &&
        stage.avg_time_in_stage_hours > 96 && // mais de 4 dias
        stage.current_count > 5
      ) {
        bottlenecks.push({
          source: source ?? 'unknown',
          funnelName: funnelName ?? 'unknown',
          stageName: stage.stage_name,
          avgTime: stage.avg_time_in_stage_hours,
          currentCount: stage.current_count,
          lostCount: stage.status_breakdown.lost,
        });
      }
    }

    // Ordena por tempo médio (maior primeiro)
    return bottlenecks.sort((a, b) => b.avgTime - a.avgTime);
  }

  /**
   * Retorna o maior bottleneck (pior tempo médio)
   */
  getBiggestBottleneck(bottlenecks: Bottleneck[]): Bottleneck | null {
    if (bottlenecks.length === 0) {
      return null;
    }

    // Já está ordenado por detectBottlenecks, então pega o primeiro
    return bottlenecks[0];
  }
}
