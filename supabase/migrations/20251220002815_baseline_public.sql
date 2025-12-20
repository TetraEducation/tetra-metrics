create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

CREATE FUNCTION "public"."ingest_spreadsheet_row"("p_email_raw" "text", "p_full_name" "text", "p_phone" "text", "p_source_system" "text", "p_source_ref" "text", "p_tag_key" "text", "p_row" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_email_norm text := lower(btrim(p_email_raw));
  v_lead_id uuid;
  v_tag_id uuid;
begin
  -- validação mínima
  if p_email_raw is null or length(btrim(p_email_raw)) = 0 then
    return jsonb_build_object('status','ignored','reason','missing_email');
  end if;

  -- encontra lead por email (única chave)
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
    -- só preenche nome se estiver vazio
    if p_full_name is not null and length(btrim(p_full_name)) > 0 then
      update public.leads
      set full_name = p_full_name
      where id = v_lead_id and (full_name is null or length(btrim(full_name)) = 0);
    end if;
  end if;

  -- telefone: guarda sem ser chave (best-effort)
  if p_phone is not null and length(btrim(p_phone)) > 0 then
    insert into public.lead_identifiers (lead_id, type, value, value_normalized, is_primary)
    values (
      v_lead_id,
      'phone',
      p_phone,
      regexp_replace(p_phone, '\\D+', '', 'g'),
      false
    )
    on conflict (type, value_normalized) do nothing;
  end if;

  -- tag canônica (CPB13 vem do nome do arquivo)
  insert into public.tags (key, name, category, weight)
  values (p_tag_key, p_tag_key, 'campaign', 1)
  on conflict (key_normalized) do update set name = excluded.name
  returning id into v_tag_id;

  -- vincula tag ao lead
  insert into public.lead_tags (lead_id, tag_id, source_system, source_ref, meta)
  values (v_lead_id, v_tag_id, p_source_system, p_source_ref, p_row)
  on conflict (lead_id, tag_id, source_system)
  do update set last_seen_at = now(), meta = public.lead_tags.meta || excluded.meta;

  -- rastreio de origem do import (não é chave)
  insert into public.lead_sources (lead_id, source_system, source_ref, meta)
  values (v_lead_id, p_source_system, p_source_ref, jsonb_build_object('tag_key', p_tag_key))
  on conflict (source_system, source_ref)
  do update set last_seen_at = now(), lead_id = excluded.lead_id, meta = public.lead_sources.meta || excluded.meta;

  return jsonb_build_object('status','ok','lead_id',v_lead_id,'tag_id',v_tag_id);
end;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: funnel_aliases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."funnel_aliases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "funnel_id" "uuid" NOT NULL,
    "source_system" "text" NOT NULL,
    "source_key" "text" NOT NULL,
    CONSTRAINT "funnel_aliases_source_key_not_blank" CHECK (("length"("btrim"("source_key")) > 0)),
    CONSTRAINT "funnel_aliases_source_system_not_blank" CHECK (("length"("btrim"("source_system")) > 0))
);


--
-- Name: funnel_stage_aliases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."funnel_stage_aliases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "funnel_stage_id" "uuid" NOT NULL,
    "source_system" "text" NOT NULL,
    "source_key" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "funnel_stage_aliases_key_not_blank" CHECK (("length"("btrim"("source_key")) > 0)),
    CONSTRAINT "funnel_stage_aliases_source_not_blank" CHECK (("length"("btrim"("source_system")) > 0))
);


--
-- Name: funnel_stages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."funnel_stages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "funnel_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "key_normalized" "text" GENERATED ALWAYS AS ("lower"("btrim"("key"))) STORED,
    "name" "text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "funnel_stages_key_not_blank" CHECK (("length"("btrim"("key")) > 0)),
    CONSTRAINT "funnel_stages_name_not_blank" CHECK (("length"("btrim"("name")) > 0))
);


--
-- Name: funnels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."funnels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "key_normalized" "text" GENERATED ALWAYS AS ("lower"("btrim"("key"))) STORED,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "funnels_key_not_blank" CHECK (("length"("btrim"("key")) > 0)),
    CONSTRAINT "funnels_name_not_blank" CHECK (("length"("btrim"("name")) > 0))
);


--
-- Name: lead_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."lead_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "source_system" "text" NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ingested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "dedupe_key" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "lead_events_event_type_not_blank" CHECK (("length"("btrim"("event_type")) > 0)),
    CONSTRAINT "lead_events_source_system_not_blank" CHECK (("length"("btrim"("source_system")) > 0))
);


--
-- Name: lead_funnel_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."lead_funnel_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "funnel_id" "uuid" NOT NULL,
    "current_stage_id" "uuid",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "source_system" "text" NOT NULL,
    "external_ref" "text" NOT NULL,
    "first_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "lead_funnel_entries_external_ref_not_blank" CHECK (("length"("btrim"("external_ref")) > 0)),
    CONSTRAINT "lead_funnel_entries_source_system_not_blank" CHECK (("length"("btrim"("source_system")) > 0))
);


--
-- Name: lead_funnel_transitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."lead_funnel_transitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_funnel_entry_id" "uuid" NOT NULL,
    "from_stage_id" "uuid",
    "to_stage_id" "uuid",
    "from_status" "text",
    "to_status" "text",
    "occurred_at" timestamp with time zone NOT NULL,
    "source_system" "text" NOT NULL,
    "external_event_id" "text",
    "dedupe_key" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


--
-- Name: lead_identifiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."lead_identifiers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "value" "text" NOT NULL,
    "value_normalized" "text" NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "lead_identifiers_type_not_blank" CHECK (("length"("btrim"("type")) > 0))
);


--
-- Name: lead_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."lead_sources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "source_system" "text" NOT NULL,
    "source_ref" "text" NOT NULL,
    "first_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "lead_sources_source_ref_not_blank" CHECK (("length"("btrim"("source_ref")) > 0)),
    CONSTRAINT "lead_sources_source_system_not_blank" CHECK (("length"("btrim"("source_system")) > 0))
);


--
-- Name: lead_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."lead_stats" (
    "lead_id" "uuid" NOT NULL,
    "first_contact_at" timestamp with time zone,
    "last_activity_at" timestamp with time zone,
    "distinct_tag_count" integer DEFAULT 0 NOT NULL,
    "event_count" integer DEFAULT 0 NOT NULL,
    "source_count" integer DEFAULT 0 NOT NULL,
    "qualification_score" integer DEFAULT 0 NOT NULL,
    "qualification_reasons" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: lead_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."lead_tags" (
    "lead_id" "uuid" NOT NULL,
    "tag_id" "uuid" NOT NULL,
    "source_system" "text" NOT NULL,
    "source_ref" "text",
    "first_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "lead_tags_source_system_not_blank" CHECK (("length"("btrim"("source_system")) > 0))
);


--
-- Name: leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "full_name" "text" NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "document" "text",
    "first_contact_at" timestamp with time zone,
    "last_activity_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: tag_aliases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."tag_aliases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tag_id" "uuid" NOT NULL,
    "source_system" "text" NOT NULL,
    "source_key" "text" NOT NULL,
    CONSTRAINT "tag_aliases_source_key_not_blank" CHECK (("length"("btrim"("source_key")) > 0)),
    CONSTRAINT "tag_aliases_source_system_not_blank" CHECK (("length"("btrim"("source_system")) > 0))
);


--
-- Name: tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "key_normalized" "text" GENERATED ALWAYS AS ("lower"("btrim"("key"))) STORED,
    "name" "text" NOT NULL,
    "category" "text",
    "weight" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tags_key_not_blank" CHECK (("length"("btrim"("key")) > 0)),
    CONSTRAINT "tags_name_not_blank" CHECK (("length"("btrim"("name")) > 0))
);


--
-- Name: funnel_aliases funnel_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."funnel_aliases"
    ADD CONSTRAINT "funnel_aliases_pkey" PRIMARY KEY ("id");


--
-- Name: funnel_stage_aliases funnel_stage_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."funnel_stage_aliases"
    ADD CONSTRAINT "funnel_stage_aliases_pkey" PRIMARY KEY ("id");


--
-- Name: funnel_stages funnel_stages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."funnel_stages"
    ADD CONSTRAINT "funnel_stages_pkey" PRIMARY KEY ("id");


--
-- Name: funnels funnels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."funnels"
    ADD CONSTRAINT "funnels_pkey" PRIMARY KEY ("id");


--
-- Name: lead_events lead_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."lead_events"
    ADD CONSTRAINT "lead_events_pkey" PRIMARY KEY ("id");


--
-- Name: lead_funnel_entries lead_funnel_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."lead_funnel_entries"
    ADD CONSTRAINT "lead_funnel_entries_pkey" PRIMARY KEY ("id");


--
-- Name: lead_funnel_transitions lead_funnel_transitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."lead_funnel_transitions"
    ADD CONSTRAINT "lead_funnel_transitions_pkey" PRIMARY KEY ("id");


--
-- Name: lead_identifiers lead_identifiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."lead_identifiers"
    ADD CONSTRAINT "lead_identifiers_pkey" PRIMARY KEY ("id");


--
-- Name: lead_sources lead_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."lead_sources"
    ADD CONSTRAINT "lead_sources_pkey" PRIMARY KEY ("id");


--
-- Name: lead_stats lead_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."lead_stats"
    ADD CONSTRAINT "lead_stats_pkey" PRIMARY KEY ("lead_id");


--
-- Name: lead_tags lead_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."lead_tags"
    ADD CONSTRAINT "lead_tags_pkey" PRIMARY KEY ("lead_id", "tag_id", "source_system");


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_pkey" PRIMARY KEY ("id");


--
-- Name: tag_aliases tag_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tag_aliases"
    ADD CONSTRAINT "tag_aliases_pkey" PRIMARY KEY ("id");


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_pkey" PRIMARY KEY ("id");


--
-- Name: idx_funnel_aliases_funnel_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_funnel_aliases_funnel_id" ON "public"."funnel_aliases" USING "btree" ("funnel_id");


--
-- Name: idx_funnel_stage_aliases_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_funnel_stage_aliases_stage" ON "public"."funnel_stage_aliases" USING "btree" ("funnel_stage_id");


--
-- Name: idx_funnel_stages_funnel_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_funnel_stages_funnel_position" ON "public"."funnel_stages" USING "btree" ("funnel_id", "position");


--
-- Name: idx_lead_events_lead_occurred; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_lead_events_lead_occurred" ON "public"."lead_events" USING "btree" ("lead_id", "occurred_at" DESC);


--
-- Name: idx_lead_events_payload_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_lead_events_payload_gin" ON "public"."lead_events" USING "gin" ("payload");


--
-- Name: idx_lead_funnel_entries_funnel_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_lead_funnel_entries_funnel_id" ON "public"."lead_funnel_entries" USING "btree" ("funnel_id");


--
-- Name: idx_lead_funnel_entries_lead_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_lead_funnel_entries_lead_id" ON "public"."lead_funnel_entries" USING "btree" ("lead_id");


--
-- Name: idx_lead_funnel_entries_stage_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_lead_funnel_entries_stage_id" ON "public"."lead_funnel_entries" USING "btree" ("current_stage_id");


--
-- Name: idx_lead_funnel_transitions_entry_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_lead_funnel_transitions_entry_time" ON "public"."lead_funnel_transitions" USING "btree" ("lead_funnel_entry_id", "occurred_at");


--
-- Name: idx_lead_funnel_transitions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_lead_funnel_transitions_status" ON "public"."lead_funnel_transitions" USING "btree" ("to_status");


--
-- Name: idx_lead_funnel_transitions_to_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_lead_funnel_transitions_to_stage" ON "public"."lead_funnel_transitions" USING "btree" ("to_stage_id");


--
-- Name: idx_lead_identifiers_lead_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_lead_identifiers_lead_id" ON "public"."lead_identifiers" USING "btree" ("lead_id");


--
-- Name: idx_lead_identifiers_primary; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_lead_identifiers_primary" ON "public"."lead_identifiers" USING "btree" ("lead_id", "is_primary" DESC);


--
-- Name: idx_lead_sources_lead_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_lead_sources_lead_id" ON "public"."lead_sources" USING "btree" ("lead_id");


--
-- Name: idx_lead_sources_system; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_lead_sources_system" ON "public"."lead_sources" USING "btree" ("source_system");


--
-- Name: idx_lead_stats_last_activity_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_lead_stats_last_activity_desc" ON "public"."lead_stats" USING "btree" ("last_activity_at" DESC);


--
-- Name: idx_lead_stats_score_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_lead_stats_score_desc" ON "public"."lead_stats" USING "btree" ("qualification_score" DESC);


--
-- Name: idx_lead_tags_lead_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_lead_tags_lead_id" ON "public"."lead_tags" USING "btree" ("lead_id");


--
-- Name: idx_lead_tags_tag_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_lead_tags_tag_id" ON "public"."lead_tags" USING "btree" ("tag_id");


--
-- Name: idx_leads_full_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_leads_full_name_trgm" ON "public"."leads" USING "gin" ("full_name" "public"."gin_trgm_ops");


--
-- Name: idx_leads_last_activity_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_leads_last_activity_at" ON "public"."leads" USING "btree" ("last_activity_at" DESC);


--
-- Name: idx_tag_aliases_tag_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tag_aliases_tag_id" ON "public"."tag_aliases" USING "btree" ("tag_id");


--
-- Name: idx_tags_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tags_name_trgm" ON "public"."tags" USING "gin" ("name" "public"."gin_trgm_ops");


--
-- Name: uq_funnel_aliases_system_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_funnel_aliases_system_key" ON "public"."funnel_aliases" USING "btree" ("source_system", "source_key");


--
-- Name: uq_funnel_stage_aliases_system_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_funnel_stage_aliases_system_key" ON "public"."funnel_stage_aliases" USING "btree" ("source_system", "source_key");


--
-- Name: uq_funnel_stages_funnel_key_norm; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_funnel_stages_funnel_key_norm" ON "public"."funnel_stages" USING "btree" ("funnel_id", "key_normalized");


--
-- Name: uq_funnels_key_normalized; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_funnels_key_normalized" ON "public"."funnels" USING "btree" ("key_normalized");


--
-- Name: uq_lead_events_system_dedupe_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_lead_events_system_dedupe_key" ON "public"."lead_events" USING "btree" ("source_system", "dedupe_key") WHERE (("dedupe_key" IS NOT NULL) AND ("length"("btrim"("dedupe_key")) > 0));


--
-- Name: uq_lead_funnel_entries_system_external_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_lead_funnel_entries_system_external_ref" ON "public"."lead_funnel_entries" USING "btree" ("source_system", "external_ref");


--
-- Name: uq_lead_funnel_transitions_dedupe; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_lead_funnel_transitions_dedupe" ON "public"."lead_funnel_transitions" USING "btree" ("source_system", "dedupe_key");


--
-- Name: uq_lead_identifiers_type_value_norm; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_lead_identifiers_type_value_norm" ON "public"."lead_identifiers" USING "btree" ("type", "value_normalized");


--
-- Name: uq_lead_primary_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_lead_primary_email" ON "public"."lead_identifiers" USING "btree" ("lead_id") WHERE (("type" = 'email'::"text") AND ("is_primary" = true));


--
-- Name: uq_lead_sources_system_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_lead_sources_system_ref" ON "public"."lead_sources" USING "btree" ("source_system", "source_ref");


--
-- Name: uq_tag_aliases_system_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_tag_aliases_system_key" ON "public"."tag_aliases" USING "btree" ("source_system", "source_key");


--
-- Name: uq_tags_key_normalized; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_tags_key_normalized" ON "public"."tags" USING "btree" ("key_normalized");


--
-- Name: funnels trg_funnels_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_funnels_updated_at" BEFORE UPDATE ON "public"."funnels" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: leads trg_leads_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_leads_updated_at" BEFORE UPDATE ON "public"."leads" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: tags trg_tags_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_tags_updated_at" BEFORE UPDATE ON "public"."tags" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: funnel_aliases funnel_aliases_funnel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."funnel_aliases"
    ADD CONSTRAINT "funnel_aliases_funnel_id_fkey" FOREIGN KEY ("funnel_id") REFERENCES "public"."funnels"("id") ON DELETE CASCADE;


--
-- Name: funnel_stage_aliases funnel_stage_aliases_funnel_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."funnel_stage_aliases"
    ADD CONSTRAINT "funnel_stage_aliases_funnel_stage_id_fkey" FOREIGN KEY ("funnel_stage_id") REFERENCES "public"."funnel_stages"("id") ON DELETE CASCADE;


--
-- Name: funnel_stages funnel_stages_funnel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."funnel_stages"
    ADD CONSTRAINT "funnel_stages_funnel_id_fkey" FOREIGN KEY ("funnel_id") REFERENCES "public"."funnels"("id") ON DELETE CASCADE;


--
-- Name: lead_events lead_events_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."lead_events"
    ADD CONSTRAINT "lead_events_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;


--
-- Name: lead_funnel_entries lead_funnel_entries_current_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."lead_funnel_entries"
    ADD CONSTRAINT "lead_funnel_entries_current_stage_id_fkey" FOREIGN KEY ("current_stage_id") REFERENCES "public"."funnel_stages"("id") ON DELETE SET NULL;


--
-- Name: lead_funnel_entries lead_funnel_entries_funnel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."lead_funnel_entries"
    ADD CONSTRAINT "lead_funnel_entries_funnel_id_fkey" FOREIGN KEY ("funnel_id") REFERENCES "public"."funnels"("id") ON DELETE CASCADE;


--
-- Name: lead_funnel_entries lead_funnel_entries_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."lead_funnel_entries"
    ADD CONSTRAINT "lead_funnel_entries_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;


--
-- Name: lead_funnel_transitions lead_funnel_transitions_from_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."lead_funnel_transitions"
    ADD CONSTRAINT "lead_funnel_transitions_from_stage_id_fkey" FOREIGN KEY ("from_stage_id") REFERENCES "public"."funnel_stages"("id") ON DELETE SET NULL;


--
-- Name: lead_funnel_transitions lead_funnel_transitions_lead_funnel_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."lead_funnel_transitions"
    ADD CONSTRAINT "lead_funnel_transitions_lead_funnel_entry_id_fkey" FOREIGN KEY ("lead_funnel_entry_id") REFERENCES "public"."lead_funnel_entries"("id") ON DELETE CASCADE;


--
-- Name: lead_funnel_transitions lead_funnel_transitions_to_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."lead_funnel_transitions"
    ADD CONSTRAINT "lead_funnel_transitions_to_stage_id_fkey" FOREIGN KEY ("to_stage_id") REFERENCES "public"."funnel_stages"("id") ON DELETE SET NULL;


--
-- Name: lead_identifiers lead_identifiers_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."lead_identifiers"
    ADD CONSTRAINT "lead_identifiers_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;


--
-- Name: lead_sources lead_sources_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."lead_sources"
    ADD CONSTRAINT "lead_sources_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;


--
-- Name: lead_stats lead_stats_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."lead_stats"
    ADD CONSTRAINT "lead_stats_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;


--
-- Name: lead_tags lead_tags_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."lead_tags"
    ADD CONSTRAINT "lead_tags_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;


--
-- Name: lead_tags lead_tags_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."lead_tags"
    ADD CONSTRAINT "lead_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE CASCADE;


--
-- Name: tag_aliases tag_aliases_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tag_aliases"
    ADD CONSTRAINT "tag_aliases_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE CASCADE;


--
-- Name: funnel_aliases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."funnel_aliases" ENABLE ROW LEVEL SECURITY;

--
-- Name: funnel_stage_aliases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."funnel_stage_aliases" ENABLE ROW LEVEL SECURITY;

--
-- Name: funnel_stages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."funnel_stages" ENABLE ROW LEVEL SECURITY;

--
-- Name: funnels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."funnels" ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."lead_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_funnel_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."lead_funnel_entries" ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_funnel_transitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."lead_funnel_transitions" ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_identifiers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."lead_identifiers" ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_sources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."lead_sources" ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_stats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."lead_stats" ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."lead_tags" ENABLE ROW LEVEL SECURITY;

--
-- Name: leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."leads" ENABLE ROW LEVEL SECURITY;

--
-- Name: tag_aliases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."tag_aliases" ENABLE ROW LEVEL SECURITY;

--
-- Name: tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."tags" ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--


