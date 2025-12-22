-- Function to ingest Clint deals with stage tracking and transitions
CREATE OR REPLACE FUNCTION public.ingest_clint_deal(p_deal jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  -- Input extraction
  v_deal_id text;
  v_origin_id text;
  v_stage_id text;
  v_stage_name text;
  v_status text;
  v_email text;
  v_phone text;
  v_name text;
  v_created_at timestamptz;
  v_updated_stage_at timestamptz;
  v_won_at timestamptz;
  v_lost_at timestamptz;
  
  -- Resolved IDs
  v_lead_id uuid;
  v_funnel_id uuid;
  v_stage_source_key text;
  v_funnel_stage_id uuid;
  v_entry_id uuid;
  
  -- Snapshot comparison
  v_old_stage_id uuid;
  v_old_status text;
  v_transition_created boolean := false;
  v_transition_ts timestamptz;
  v_dedupe_key text;
  v_normalized_status text;
BEGIN
  -- Extract deal data
  v_deal_id := p_deal->>'id';
  v_origin_id := coalesce(p_deal->>'origin_id', p_deal->>'originId');
  v_stage_id := coalesce(p_deal->>'stage_id', p_deal->>'stageId');
  v_stage_name := coalesce(p_deal->>'stage', v_stage_id, 'Unknown');
  v_status := upper(coalesce(p_deal->>'status', 'OPEN'));
  
  v_email := lower(trim(coalesce(p_deal->'contact'->>'email', '')));
  v_phone := trim(coalesce(p_deal->'contact'->>'phone', ''));
  v_name := trim(coalesce(p_deal->'contact'->>'name', ''));
  
  -- Timestamps
  v_created_at := coalesce((p_deal->>'created_at')::timestamptz, now());
  v_updated_stage_at := coalesce((p_deal->>'updated_stage_at')::timestamptz, now());
  v_won_at := (p_deal->>'won_at')::timestamptz;
  v_lost_at := (p_deal->>'lost_at')::timestamptz;
  
  -- Validate required fields
  IF v_deal_id IS NULL OR v_deal_id = '' THEN
    RETURN jsonb_build_object('status', 'error', 'reason', 'missing_deal_id');
  END IF;
  
  IF v_email IS NULL OR v_email = '' OR v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
    RETURN jsonb_build_object('status', 'ignored', 'reason', 'invalid_email');
  END IF;
  
  -- Normalize status
  v_normalized_status := CASE 
    WHEN v_status = 'WON' THEN 'won'
    WHEN v_status = 'LOST' THEN 'lost'
    ELSE 'open'
  END;
  
  -- 1) RESOLVE OR CREATE LEAD
  SELECT li.lead_id INTO v_lead_id
  FROM public.lead_identifiers li
  WHERE li.type = 'email' AND li.value_normalized = v_email
  LIMIT 1;
  
  IF v_lead_id IS NULL THEN
    -- Create lead
    INSERT INTO public.leads (full_name, first_contact_at, last_activity_at)
    VALUES (coalesce(v_name, ''), v_created_at, v_updated_stage_at)
    RETURNING id INTO v_lead_id;
    
    -- Insert email identifier
    INSERT INTO public.lead_identifiers (lead_id, type, value, value_normalized, is_primary)
    VALUES (v_lead_id, 'email', v_email, v_email, true)
    ON CONFLICT (type, value_normalized) DO UPDATE
      SET is_primary = true, lead_id = excluded.lead_id;
    
    -- Insert phone if available
    IF v_phone IS NOT NULL AND v_phone != '' THEN
      INSERT INTO public.lead_identifiers (lead_id, type, value, value_normalized, is_primary)
      VALUES (v_lead_id, 'phone', v_phone, regexp_replace(v_phone, '\D+', '', 'g'), false)
      ON CONFLICT (type, value_normalized) DO NOTHING;
    END IF;
  ELSE
    -- Update existing lead timestamps
    UPDATE public.leads
    SET last_activity_at = GREATEST(last_activity_at, v_updated_stage_at),
        first_contact_at = LEAST(first_contact_at, v_created_at)
    WHERE id = v_lead_id;
  END IF;
  
  -- 2) RESOLVE OR CREATE FUNNEL (from origin_id)
  IF v_origin_id IS NOT NULL AND v_origin_id != '' THEN
    -- Try to find existing funnel via alias
    SELECT fa.funnel_id INTO v_funnel_id
    FROM public.funnel_aliases fa
    WHERE fa.source_system = 'clint' AND fa.source_key = v_origin_id
    LIMIT 1;
    
    IF v_funnel_id IS NULL THEN
      -- Create funnel
      INSERT INTO public.funnels (key, name)
      VALUES ('clint-origin-' || v_origin_id, 'Clint Origin ' || v_origin_id)
      ON CONFLICT (key_normalized) DO UPDATE SET name = excluded.name
      RETURNING id INTO v_funnel_id;
      
      -- Create alias
      INSERT INTO public.funnel_aliases (funnel_id, source_system, source_key)
      VALUES (v_funnel_id, 'clint', v_origin_id)
      ON CONFLICT (source_system, source_key) DO NOTHING;
    END IF;
  ELSE
    -- Fallback to unknown funnel
    INSERT INTO public.funnels (key, name)
    VALUES ('clint-origin-unknown', 'Clint Unknown Origin')
    ON CONFLICT (key_normalized) DO UPDATE SET name = excluded.name
    RETURNING id INTO v_funnel_id;
  END IF;
  
  -- 3) RESOLVE OR CREATE FUNNEL_STAGE (from stage_id)
  IF v_stage_id IS NOT NULL AND v_stage_id != '' AND v_origin_id IS NOT NULL AND v_origin_id != '' THEN
    -- Stage source key is composite: origin_id:stage_id
    v_stage_source_key := v_origin_id || ':' || v_stage_id;
    
    -- Try to find existing stage via alias
    SELECT fsa.funnel_stage_id INTO v_funnel_stage_id
    FROM public.funnel_stage_aliases fsa
    WHERE fsa.source_system = 'clint' AND fsa.source_key = v_stage_source_key
    LIMIT 1;
    
    IF v_funnel_stage_id IS NULL THEN
      -- Create funnel stage
      INSERT INTO public.funnel_stages (funnel_id, key, name, position)
      VALUES (v_funnel_id, 'clint-stage-' || v_stage_id, v_stage_name, 0)
      ON CONFLICT (funnel_id, key_normalized) DO UPDATE SET name = excluded.name
      RETURNING id INTO v_funnel_stage_id;
      
      -- Create stage alias
      INSERT INTO public.funnel_stage_aliases (funnel_stage_id, source_system, source_key)
      VALUES (v_funnel_stage_id, 'clint', v_stage_source_key)
      ON CONFLICT (source_system, source_key) DO NOTHING;
    END IF;
  END IF;
  
  -- 4) UPSERT LEAD_FUNNEL_ENTRY
  -- Check if entry already exists
  SELECT id, current_stage_id, status
  INTO v_entry_id, v_old_stage_id, v_old_status
  FROM public.lead_funnel_entries
  WHERE source_system = 'clint' AND external_ref = v_deal_id;
  
  IF v_entry_id IS NULL THEN
    -- Create new entry
    INSERT INTO public.lead_funnel_entries (
      lead_id, funnel_id, current_stage_id, status,
      source_system, external_ref,
      first_seen_at, last_seen_at, meta
    )
    VALUES (
      v_lead_id, v_funnel_id, v_funnel_stage_id, v_normalized_status,
      'clint', v_deal_id,
      v_created_at, v_updated_stage_at, p_deal
    )
    RETURNING id INTO v_entry_id;
    
    -- Create initial transition (from null to current)
    v_dedupe_key := 'clint:deal:' || v_deal_id || ':created';
    
    INSERT INTO public.lead_funnel_transitions (
      lead_funnel_entry_id, from_stage_id, to_stage_id,
      from_status, to_status, occurred_at,
      source_system, dedupe_key
    )
    VALUES (
      v_entry_id, NULL, v_funnel_stage_id,
      NULL, v_normalized_status, v_created_at,
      'clint', v_dedupe_key
    )
    ON CONFLICT (source_system, dedupe_key) DO NOTHING;
    
    v_transition_created := true;
  ELSE
    -- Update existing entry
    UPDATE public.lead_funnel_entries
    SET 
      lead_id = v_lead_id,
      funnel_id = v_funnel_id,
      current_stage_id = v_funnel_stage_id,
      status = v_normalized_status,
      last_seen_at = v_updated_stage_at,
      meta = p_deal
    WHERE id = v_entry_id;
    
    -- 5) CREATE TRANSITION if stage or status changed
    IF (v_old_stage_id IS DISTINCT FROM v_funnel_stage_id) OR (v_old_status IS DISTINCT FROM v_normalized_status) THEN
      -- Determine transition timestamp and dedupe_key
      IF v_old_stage_id IS DISTINCT FROM v_funnel_stage_id THEN
        -- Stage changed
        v_transition_ts := v_updated_stage_at;
        v_dedupe_key := 'clint:deal:' || v_deal_id || ':stage:' || coalesce(v_stage_id, 'null') || ':at:' || v_transition_ts::text;
      ELSE
        -- Only status changed
        IF v_normalized_status = 'won' AND v_won_at IS NOT NULL THEN
          v_transition_ts := v_won_at;
        ELSIF v_normalized_status = 'lost' AND v_lost_at IS NOT NULL THEN
          v_transition_ts := v_lost_at;
        ELSE
          v_transition_ts := v_updated_stage_at;
        END IF;
        v_dedupe_key := 'clint:deal:' || v_deal_id || ':status:' || v_normalized_status || ':at:' || v_transition_ts::text;
      END IF;
      
      -- Insert transition
      INSERT INTO public.lead_funnel_transitions (
        lead_funnel_entry_id, from_stage_id, to_stage_id,
        from_status, to_status, occurred_at,
        source_system, dedupe_key
      )
      VALUES (
        v_entry_id, v_old_stage_id, v_funnel_stage_id,
        v_old_status, v_normalized_status, v_transition_ts,
        'clint', v_dedupe_key
      )
      ON CONFLICT (source_system, dedupe_key) DO NOTHING;
      
      v_transition_created := true;
    END IF;
  END IF;
  
  -- Return result
  RETURN jsonb_build_object(
    'status', 'ok',
    'lead_id', v_lead_id,
    'funnel_id', v_funnel_id,
    'entry_id', v_entry_id,
    'stage_id', v_funnel_stage_id,
    'transition_created', v_transition_created
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'reason', SQLERRM,
      'detail', SQLSTATE
    );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.ingest_clint_deal(jsonb) TO authenticated, anon, service_role;


