-- Update ingest_spreadsheet_row to always update name when provided
-- Since we now calculate the best name in the service layer using chooseBetterName,
-- we should always update the name when a better one is provided
CREATE OR REPLACE FUNCTION public.ingest_spreadsheet_row(
  p_email_raw text,
  p_full_name text,
  p_phone text,
  p_source_system text,
  p_source_ref text,
  p_tag_key text,
  p_row jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
declare
  v_email_norm text := lower(btrim(p_email_raw));
  v_lead_id uuid;
  v_tag_id uuid;
begin
  if p_email_raw is null or length(btrim(p_email_raw)) = 0 then
    return jsonb_build_object('status','ignored','reason','missing_email');
  end if;

  select li.lead_id into v_lead_id
  from public.lead_identifiers li
  where li.type = 'email' and li.value_normalized = v_email_norm
  limit 1;

  if v_lead_id is null then
    insert into public.leads (full_name)
    values (coalesce(p_full_name, ''))
    returning id into v_lead_id;

    insert into public.lead_identifiers (lead_id, type, value, value_normalized, is_primary)
    values (v_lead_id, 'email', p_email_raw, v_email_norm, true)
    on conflict (type, value_normalized) do update
      set is_primary = true;
  else
    -- Always update name when provided (service layer already calculated best name)
    if p_full_name is not null and length(btrim(p_full_name)) > 0 then
      update public.leads
      set full_name = p_full_name
      where id = v_lead_id;
    end if;
  end if;

  if p_phone is not null and length(btrim(p_phone)) > 0 then
    insert into public.lead_identifiers (lead_id, type, value, value_normalized, is_primary)
    values (
      v_lead_id,
      'phone',
      p_phone,
      regexp_replace(p_phone, '\D+', '', 'g'),
      false
    )
    on conflict (type, value_normalized) do nothing;
  end if;

  insert into public.tags (key, name, category, weight)
  values (p_tag_key, p_tag_key, 'campaign', 1)
  on conflict (key_normalized) do update set name = excluded.name
  returning id into v_tag_id;

  insert into public.lead_tags (lead_id, tag_id, source_system, source_ref, meta)
  values (v_lead_id, v_tag_id, p_source_system, p_source_ref, p_row)
  on conflict (lead_id, tag_id, source_system)
  do update set last_seen_at = now(), meta = public.lead_tags.meta || excluded.meta;

  insert into public.lead_sources (lead_id, source_system, source_ref, meta)
  values (v_lead_id, p_source_system, p_source_ref, jsonb_build_object('tag_key', p_tag_key))
  on conflict (source_system, source_ref)
  do update set last_seen_at = now(), lead_id = excluded.lead_id, meta = public.lead_sources.meta || excluded.meta;

  return jsonb_build_object('status','ok','lead_id',v_lead_id,'tag_id',v_tag_id);
end;
$$;


