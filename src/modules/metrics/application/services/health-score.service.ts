import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthScoreService {
  /**
   * Calcula health score (0-100) baseado em métricas
   * @param conversionRate Taxa de conversão em porcentagem (0-100)
   * @param avgTime Tempo médio em horas
   * @param lossRate Taxa de perda em porcentagem (0-100)
   * @returns Health score de 0 a 100
   */
  calculateHealthScore(conversionRate: number, avgTime: number, lossRate: number): number {
    let score = 100;

    score -= Math.max(0, 100 - conversionRate * 5);

    score -= Math.min(30, avgTime / 10);

    score -= Math.min(20, lossRate / 5);

    return Math.max(0, Math.min(100, Math.round(score)));
  }
}
