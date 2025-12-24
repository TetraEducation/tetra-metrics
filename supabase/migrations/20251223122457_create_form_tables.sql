-- Migration: Create form_schemas, form_questions, form_submissions, and form_answers tables
-- These tables are used to store survey/form data from spreadsheet imports

-- Table: form_schemas
-- Template of a form/spreadsheet (one tab, one CSV, one survey source)
CREATE TABLE "public"."form_schemas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_system" "text" NOT NULL,
    "source_ref" "text" NOT NULL,
    "name" "text" NOT NULL,
    "name_normalized" "text" GENERATED ALWAYS AS ("lower"("regexp_replace"("btrim"("name"), '[^a-z0-9]+', '-', 'g'))) STORED,
    "tag_id" "uuid",
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "form_schemas_source_system_not_blank" CHECK (("length"("btrim"("source_system")) > 0)),
    CONSTRAINT "form_schemas_source_ref_not_blank" CHECK (("length"("btrim"("source_ref")) > 0)),
    CONSTRAINT "form_schemas_name_not_blank" CHECK (("length"("btrim"("name")) > 0))
);

-- Table: form_questions
-- Questions (usually columns) within a form_schema
CREATE TABLE "public"."form_questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "form_schema_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "key_normalized" "text" GENERATED ALWAYS AS ("lower"("regexp_replace"("btrim"("key"), '[^a-z0-9]+', '-', 'g'))) STORED,
    "label" "text" NOT NULL,
    "position" integer NOT NULL,
    "data_type" "text" DEFAULT 'text' NOT NULL,
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "form_questions_form_schema_id_not_null" CHECK (("form_schema_id" IS NOT NULL)),
    CONSTRAINT "form_questions_key_not_blank" CHECK (("length"("btrim"("key")) > 0)),
    CONSTRAINT "form_questions_label_not_blank" CHECK (("length"("btrim"("label")) > 0)),
    CONSTRAINT "form_questions_position_positive" CHECK (("position" > 0)),
    CONSTRAINT "form_questions_data_type_valid" CHECK (("data_type" IN ('text', 'number', 'bool', 'date', 'select', 'unknown')))
);

-- Table: form_submissions
-- A submission/imported row (1 row => 1 submission)
CREATE TABLE "public"."form_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "form_schema_id" "uuid" NOT NULL,
    "lead_id" "uuid",
    "submitted_at" timestamp with time zone,
    "source_ref" "text",
    "dedupe_key" "text",
    "raw_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "form_submissions_form_schema_id_not_null" CHECK (("form_schema_id" IS NOT NULL))
);

-- Table: form_answers
-- Answers per question (1 cell => 1 answer)
CREATE TABLE "public"."form_answers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "form_submission_id" "uuid" NOT NULL,
    "question_id" "uuid" NOT NULL,
    "value_text" "text",
    "value_number" numeric,
    "value_bool" boolean,
    "value_json" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "form_answers_form_submission_id_not_null" CHECK (("form_submission_id" IS NOT NULL)),
    CONSTRAINT "form_answers_question_id_not_null" CHECK (("question_id" IS NOT NULL))
);

-- Primary keys
ALTER TABLE ONLY "public"."form_schemas"
    ADD CONSTRAINT "form_schemas_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."form_questions"
    ADD CONSTRAINT "form_questions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."form_submissions"
    ADD CONSTRAINT "form_submissions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."form_answers"
    ADD CONSTRAINT "form_answers_pkey" PRIMARY KEY ("id");

-- Foreign keys
ALTER TABLE ONLY "public"."form_schemas"
    ADD CONSTRAINT "form_schemas_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."form_questions"
    ADD CONSTRAINT "form_questions_form_schema_id_fkey" FOREIGN KEY ("form_schema_id") REFERENCES "public"."form_schemas"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."form_submissions"
    ADD CONSTRAINT "form_submissions_form_schema_id_fkey" FOREIGN KEY ("form_schema_id") REFERENCES "public"."form_schemas"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."form_submissions"
    ADD CONSTRAINT "form_submissions_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."form_answers"
    ADD CONSTRAINT "form_answers_form_submission_id_fkey" FOREIGN KEY ("form_submission_id") REFERENCES "public"."form_submissions"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."form_answers"
    ADD CONSTRAINT "form_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."form_questions"("id") ON DELETE CASCADE;

-- Unique constraints
ALTER TABLE ONLY "public"."form_schemas"
    ADD CONSTRAINT "form_schemas_source_system_source_ref_unique" UNIQUE ("source_system", "source_ref");

ALTER TABLE ONLY "public"."form_questions"
    ADD CONSTRAINT "form_questions_form_schema_id_key_normalized_unique" UNIQUE ("form_schema_id", "key_normalized");

-- Unique constraint for form_submissions: (form_schema_id, dedupe_key) when dedupe_key is not null
-- Using a partial unique index since dedupe_key can be null
CREATE UNIQUE INDEX "form_submissions_form_schema_id_dedupe_key_unique" ON "public"."form_submissions" ("form_schema_id", "dedupe_key")
    WHERE "dedupe_key" IS NOT NULL;

ALTER TABLE ONLY "public"."form_answers"
    ADD CONSTRAINT "form_answers_form_submission_id_question_id_unique" UNIQUE ("form_submission_id", "question_id");

-- Indexes for performance
CREATE INDEX "form_questions_form_schema_id_idx" ON "public"."form_questions" ("form_schema_id");
CREATE INDEX "form_submissions_form_schema_id_idx" ON "public"."form_submissions" ("form_schema_id");
CREATE INDEX "form_submissions_lead_id_idx" ON "public"."form_submissions" ("lead_id");
CREATE INDEX "form_submissions_dedupe_key_idx" ON "public"."form_submissions" ("dedupe_key") WHERE "dedupe_key" IS NOT NULL;
CREATE INDEX "form_answers_form_submission_id_idx" ON "public"."form_answers" ("form_submission_id");
CREATE INDEX "form_answers_question_id_idx" ON "public"."form_answers" ("question_id");

-- Triggers for updated_at
CREATE TRIGGER "form_schemas_updated_at" BEFORE UPDATE ON "public"."form_schemas"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

CREATE TRIGGER "form_questions_updated_at" BEFORE UPDATE ON "public"."form_questions"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

CREATE TRIGGER "form_submissions_updated_at" BEFORE UPDATE ON "public"."form_submissions"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


