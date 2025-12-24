-- Migration: Create RPC function to upsert form_submissions
-- This function handles upsert correctly with partial unique indexes

CREATE OR REPLACE FUNCTION "public"."upsert_form_submissions"(
  "p_submissions" "jsonb"
) RETURNS "jsonb"
  LANGUAGE "plpgsql" SECURITY DEFINER
  AS $$
declare
  v_submission "jsonb";
  v_result "jsonb" := '[]'::"jsonb";
  v_id "uuid";
  v_dedupe_key "text";
begin
  for v_submission in select * from jsonb_array_elements(p_submissions)
  loop
    v_dedupe_key := v_submission->>'dedupe_key';
    
    if v_dedupe_key is null or length(btrim(v_dedupe_key)) = 0 then
      continue;
    end if;

    insert into public.form_submissions (
      form_schema_id,
      lead_id,
      submitted_at,
      source_ref,
      dedupe_key,
      raw_payload
    )
    values (
      (v_submission->>'form_schema_id')::uuid,
      case when v_submission->>'lead_id' is not null then (v_submission->>'lead_id')::uuid else null end,
      case when v_submission->>'submitted_at' is not null then (v_submission->>'submitted_at')::timestamptz else null end,
      v_submission->>'source_ref',
      v_dedupe_key,
      coalesce(v_submission->'raw_payload', '{}'::jsonb)
    )
    on conflict (form_schema_id, dedupe_key) 
    where dedupe_key is not null
    do update set
      lead_id = excluded.lead_id,
      submitted_at = coalesce(excluded.submitted_at, form_submissions.submitted_at),
      source_ref = excluded.source_ref,
      raw_payload = form_submissions.raw_payload || excluded.raw_payload,
      updated_at = now()
    returning id into v_id;

    v_result := v_result || jsonb_build_array(
      jsonb_build_object(
        'id', v_id,
        'dedupe_key', v_dedupe_key
      )
    );
  end loop;

  return v_result;
end;
$$;

