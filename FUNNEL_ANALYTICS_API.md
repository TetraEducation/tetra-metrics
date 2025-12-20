# API de Analytics de Funnels

## Endpoint

```
GET /leads/funnels/analytics?source_system=clint
```

## Estrutura de Resposta

A resposta retorna uma lista de funnels (origens) com seus stages (status) e métricas detalhadas:

```json
{
  "funnels": [
    {
      "funnel_id": "uuid",
      "funnel_name": "[NOVO] Perpétuo - Tetra Club",  // ← ORIGEM (título da seção)
      "source_system": "clint",
      "total_leads": 689,
      "active_deals": 672,
      "won_deals": 3,
      "lost_deals": 14,
      "overall_conversion_rate": 0.44,
      "stages": [  // ← CARDS (um card por stage)
        {
          "stage_id": "uuid",
          "stage_name": "Prospeccao",  // ← Nome do card
          "position": 2,
          "current_count": 460,  // Leads atualmente neste stage
          "total_entries": 920,  // Total que já passou por aqui
          "avg_time_in_stage_hours": 98.15,  // Tempo médio em horas
          "avg_time_in_stage_days": 4.09,  // Tempo médio em dias (mais legível)
          "conversion_to_next": 0,  // % que avança para próximo stage
          "loss_rate": 0.33,  // % perdido neste stage (lost / total)
          "win_rate": 0,  // % ganho neste stage (won / total)
          "status_breakdown": {
            "open": 457,
            "won": 0,
            "lost": 3
          }
        }
      ],
      "created_at": "2025-01-01T00:00:00Z",
      "last_activity": "2025-12-20T13:00:00Z"
    }
  ],
  "total_funnels": 1,
  "global_stats": {
    "total_leads": 689,
    "total_active": 672,
    "total_won": 3,
    "total_lost": 14,
    "avg_conversion_rate": 0.44
  }
}
```

## Como Usar na Dashboard

### 1. Estrutura Visual

```
┌─────────────────────────────────────────┐
│ [NOVO] Perpétuo - Tetra Club           │ ← funnel_name (título)
│ Total: 689 | Ativos: 672 | Taxa: 0.44% │
├─────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│ │ Base    │ │Prospecção│ │ Conexão │   │ ← stages (cards)
│ │ 7 leads │ │ 460 leads│ │140 leads│   │
│ │         │ │ 98h médio│ │ 4d médio│   │
│ └─────────┘ └─────────┘ └─────────┘   │
└─────────────────────────────────────────┘
```

### 2. Dados por Card (Stage)

Cada card deve exibir:

- **Título**: `stage_name` (ex: "Prospeccao", "Conexao")
- **Leads Atuais**: `current_count` (ex: 460)
- **Tempo Médio**: 
  - `avg_time_in_stage_days` (se disponível, ex: "4.09 dias")
  - ou `avg_time_in_stage_hours` (ex: "98.15 horas")
- **Taxa de Conversão**: `conversion_to_next` (ex: "0% avança")
- **Taxa de Perda**: `loss_rate` (ex: "0.33% perdidos")
- **Status**: 
  - `status_breakdown.open` (em aberto)
  - `status_breakdown.won` (ganhos)
  - `status_breakdown.lost` (perdidos)

### 3. Exemplo de Card

```typescript
// Exemplo React/Vue
function StageCard({ stage }: { stage: StageAnalyticsDto }) {
  return (
    <div className="stage-card">
      <h3>{stage.stage_name}</h3>
      <div className="metrics">
        <div>Leads Atuais: {stage.current_count}</div>
        <div>Total que passou: {stage.total_entries}</div>
        {stage.avg_time_in_stage_days && (
          <div>Tempo Médio: {stage.avg_time_in_stage_days} dias</div>
        )}
        {stage.conversion_to_next !== null && (
          <div>Conversão: {stage.conversion_to_next}%</div>
        )}
        <div>Taxa de Perda: {stage.loss_rate}%</div>
        <div>Taxa de Sucesso: {stage.win_rate}%</div>
        <div className="status">
          <span>🟢 {stage.status_breakdown.open} abertos</span>
          <span>✅ {stage.status_breakdown.won} ganhos</span>
          <span>❌ {stage.status_breakdown.lost} perdidos</span>
        </div>
      </div>
    </div>
  );
}
```

### 4. Métricas Importantes para Dashboard

#### Identificar Gargalos:
- **Tempo médio alto** (`avg_time_in_stage_days` > 7): Stage onde leads ficam presos
- **Taxa de conversão baixa** (`conversion_to_next` < 20%): Stage com baixa eficiência
- **Taxa de perda alta** (`loss_rate` > 10%): Stage com muitos abandonos

#### KPIs Principais:
- `overall_conversion_rate`: Taxa geral de conversão do funnel
- `total_leads`: Total de leads no funnel
- `active_deals`: Leads ainda em processo
- `won_deals`: Leads convertidos
- `lost_deals`: Leads perdidos

## Filtros

### Por Source System
```
GET /leads/funnels/analytics?source_system=clint
```

Retorna apenas funnels do sistema especificado.

## Valores Null

Alguns valores podem ser `null` quando:
- `avg_time_in_stage_hours`: Não há transições suficientes para calcular
- `conversion_to_next`: Não há próximo stage ou não há transições
- `avg_time_in_stage_days`: Calculado a partir de `avg_time_in_stage_hours`

Sempre verifique `!== null` antes de exibir esses valores.

