-- Otimiza o filtro/inner join por source_system='clint' na listagem de leads
-- (reduz custo do semi-join em lead_sources quando o filtro é aplicado).
CREATE INDEX IF NOT EXISTS idx_lead_sources_clint_lead_id
  ON public.lead_sources (lead_id)
  WHERE source_system = 'clint';

