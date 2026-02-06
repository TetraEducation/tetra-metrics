-- Create lead_search_profile table for persistent lead filtering preferences
CREATE TABLE IF NOT EXISTS "public"."lead_search_profile" (
    "lead_id" "uuid" PRIMARY KEY,
    "salary_min" numeric,
    "salary_max" numeric,
    "age_min" integer,
    "age_max" integer,
    "gender" text,
    "company_size" text,
    "education_level" text,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "lead_search_profile_salary_range_valid" CHECK (
      "salary_min" IS NULL
      OR "salary_max" IS NULL
      OR "salary_min" <= "salary_max"
    ),
    CONSTRAINT "lead_search_profile_age_range_valid" CHECK (
      "age_min" IS NULL
      OR "age_max" IS NULL
      OR "age_min" <= "age_max"
    ),
    CONSTRAINT "lead_search_profile_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "lead_search_profile_salary_min_idx"
  ON "public"."lead_search_profile" ("salary_min");
CREATE INDEX IF NOT EXISTS "lead_search_profile_salary_max_idx"
  ON "public"."lead_search_profile" ("salary_max");
CREATE INDEX IF NOT EXISTS "lead_search_profile_age_min_idx"
  ON "public"."lead_search_profile" ("age_min");
CREATE INDEX IF NOT EXISTS "lead_search_profile_age_max_idx"
  ON "public"."lead_search_profile" ("age_max");
CREATE INDEX IF NOT EXISTS "lead_search_profile_gender_idx"
  ON "public"."lead_search_profile" ("gender");
CREATE INDEX IF NOT EXISTS "lead_search_profile_company_size_idx"
  ON "public"."lead_search_profile" ("company_size");
CREATE INDEX IF NOT EXISTS "lead_search_profile_education_level_idx"
  ON "public"."lead_search_profile" ("education_level");

-- Composite indexes to optimize common numeric range filters
CREATE INDEX IF NOT EXISTS "lead_search_profile_salary_range_idx"
  ON "public"."lead_search_profile" ("salary_min", "salary_max");
CREATE INDEX IF NOT EXISTS "lead_search_profile_age_range_idx"
  ON "public"."lead_search_profile" ("age_min", "age_max");

-- Create job_runs table for background job observability/state management
CREATE TABLE IF NOT EXISTS "public"."job_runs" (
    "id" "uuid" DEFAULT gen_random_uuid() PRIMARY KEY,
    "job_name" text NOT NULL,
    "status" text NOT NULL,
    "started_at" timestamp with time zone DEFAULT now() NOT NULL,
    "finished_at" timestamp with time zone,
    "step" text,
    "cursor_created_at" timestamp with time zone,
    "cursor_id" "uuid",
    "processed_rows" integer DEFAULT 0 NOT NULL,
    "processed_leads" integer DEFAULT 0 NOT NULL,
    "error_message" text,
    "meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT "job_runs_job_name_not_blank" CHECK (length(btrim("job_name")) > 0),
    CONSTRAINT "job_runs_status_not_blank" CHECK (length(btrim("status")) > 0),
    CONSTRAINT "job_runs_processed_rows_non_negative" CHECK ("processed_rows" >= 0),
    CONSTRAINT "job_runs_processed_leads_non_negative" CHECK ("processed_leads" >= 0)
);

CREATE INDEX IF NOT EXISTS "job_runs_job_name_status_started_at_idx"
  ON "public"."job_runs" ("job_name", "status", "started_at" DESC);

-- Auxiliary indexes to optimize form_answers scans and lookups
CREATE INDEX IF NOT EXISTS "form_answers_created_at_id_idx"
  ON "public"."form_answers" ("created_at", "id");

CREATE INDEX IF NOT EXISTS "form_answers_question_id_idx"
  ON "public"."form_answers" ("question_id");
