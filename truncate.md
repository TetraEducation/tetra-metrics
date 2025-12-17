begin;

-- Dados derivados / operacionais
truncate table
  lead_events,
  lead_funnel_entries,
  lead_tags,
  lead_sources,
  lead_identifiers,
  lead_stats
restart identity cascade;

-- Catálogos vindos do Clint
truncate table
  funnel_stages,
  funnel_aliases,
  funnels,
  tag_aliases,
  tags
restart identity cascade;

-- Entidade central
truncate table
  leads
restart identity cascade;

commit;