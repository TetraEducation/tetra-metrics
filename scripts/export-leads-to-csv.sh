#!/usr/bin/env bash
set -euo pipefail

# Exporta uma planilha (CSV) com dados consolidados do lead.
# Requer: psql disponível no PATH e a variável DATABASE_URL_OFICIAL apontando para o Postgres/Supabase.
#
# Uso:
#   export DATABASE_URL_OFICIAL='postgresql://...'
#   bash scripts/export-leads-to-csv.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -z "${DATABASE_URL_OFICIAL:-}" ]]; then
  echo "❌ Erro: Variável DATABASE_URL_OFICIAL não está definida"
  echo "Defina com: export DATABASE_URL_OFICIAL='postgresql://...'"
  exit 1
fi

mkdir -p "$ROOT_DIR/exports"
OUTPUT_FILE="$ROOT_DIR/exports/leads.csv"

echo "📤 Exportando leads para: $OUTPUT_FILE"

# Último contato Comercial (ficará para depois) — deixado comentado como referência:
# (select max(occurred_at)
#  from public.lead_events le
#  where le.lead_id = l.id
#    and (le.event_type ilike '%comercial%' or le.event_type ilike '%sales%')
# ) as "Ultimo contato Comercial",

psql "$DATABASE_URL_OFICIAL" \
  -X \
  -v ON_ERROR_STOP=1 <<'SQL' >"$OUTPUT_FILE"
copy (
  select
    coalesce(st.first_contact_at, l.first_contact_at, ls_min.first_seen_at, l.created_at) as "Data de origem",
    coalesce(nullif(camp.campaigns, ''), nullif(ls_list.sources, ''), '') as "Origem",
    l.full_name as "Nome",
    phone.phone as "Telefone",
    email.email as "E-mail",
    coalesce(surveys.surveys_json, '[]'::jsonb)::text as "Todas as informacoes de pesquisa",
    mkt.last_mkt as "Ultimo contato MKT",
    stage.stage_name as "Etapa Comercial",
    coalesce(st.qualification_score, 0) as "Lead Score"
  from public.leads l
  left join public.lead_stats st on st.lead_id = l.id
  left join lateral (
    select min(ls.first_seen_at) as first_seen_at
    from public.lead_sources ls
    where ls.lead_id = l.id
  ) ls_min on true
  left join lateral (
    select string_agg(distinct ls.source_system, ', ' order by ls.source_system) as sources
    from public.lead_sources ls
    where ls.lead_id = l.id
  ) ls_list on true
  left join lateral (
    select string_agg(distinct t.key, ', ' order by t.key) as campaigns
    from public.lead_tags lt
    join public.tags t on t.id = lt.tag_id
    where lt.lead_id = l.id
      and t.category = 'campaign'
  ) camp on true
  left join lateral (
    select li.value as email
    from public.lead_identifiers li
    where li.lead_id = l.id
      and li.type = 'email'
    order by li.is_primary desc, li.created_at asc
    limit 1
  ) email on true
  left join lateral (
    select li.value as phone
    from public.lead_identifiers li
    where li.lead_id = l.id
      and li.type = 'phone'
    order by li.is_primary desc, li.created_at asc
    limit 1
  ) phone on true
  left join lateral (
    select fs.name as stage_name
    from public.lead_funnel_entries lfe
    join public.funnels f on f.id = lfe.funnel_id
    left join public.funnel_stages fs on fs.id = lfe.current_stage_id
    where lfe.lead_id = l.id
    order by
      (f.name ilike '%comercial%') desc,
      lfe.last_seen_at desc nulls last,
      lfe.first_seen_at desc nulls last
    limit 1
  ) stage on true
  left join lateral (
    select max(le.occurred_at) as last_mkt
    from public.lead_events le
    where le.lead_id = l.id
      and (
        le.source_system = 'activecampaign'
        or le.event_type like 'survey.%'
      )
  ) mkt on true
  left join lateral (
    select
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'form_name', sc.name,
            'submitted_at', sub.submitted_at,
            'source_ref', sub.source_ref,
            'dedupe_key', sub.dedupe_key,
            'answers',
              coalesce((
                select jsonb_agg(
                  jsonb_build_object(
                    'question', q.label,
                    'key', q.key,
                    'position', q.position,
                    'data_type', q.data_type,
                    'answer', coalesce(
                      a.value_text,
                      a.value_number::text,
                      a.value_bool::text,
                      a.value_json::text
                    )
                  )
                  order by q.position
                )
                from public.form_answers a
                join public.form_questions q on q.id = a.question_id
                where a.form_submission_id = sub.id
              ), '[]'::jsonb)
          )
          order by sub.submitted_at desc nulls last, sub.created_at desc
        ),
        '[]'::jsonb
      ) as surveys_json
    from public.form_submissions sub
    join public.form_schemas sc on sc.id = sub.form_schema_id
    where sub.lead_id = l.id
  ) surveys on true
  order by "Data de origem" desc nulls last, l.id
) to stdout with (format csv, header true, encoding 'UTF8');
SQL

echo "✅ CSV gerado com sucesso: $OUTPUT_FILE"



