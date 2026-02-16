BEGIN;

CREATE TABLE IF NOT EXISTS "lead_search_profile" (
  "lead_id" TEXT NOT NULL,
  "salary_min" NUMERIC(10, 2),
  "salary_max" NUMERIC(10, 2),
  "age_min" INTEGER,
  "age_max" INTEGER,
  "gender" TEXT,
  "company_size" TEXT,
  "education_level" TEXT,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lead_search_profile_pkey" PRIMARY KEY ("lead_id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'lead_search_profile_lead_id_fkey'
      AND conrelid = 'lead_search_profile'::regclass
  ) THEN
    ALTER TABLE "lead_search_profile"
      ADD CONSTRAINT "lead_search_profile_lead_id_fkey"
      FOREIGN KEY ("lead_id")
      REFERENCES "leads"("lead_id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'lead_search_profile_salary_range_valid'
      AND conrelid = 'lead_search_profile'::regclass
  ) THEN
    ALTER TABLE "lead_search_profile"
      ADD CONSTRAINT "lead_search_profile_salary_range_valid"
      CHECK (
        "salary_min" IS NULL
        OR "salary_max" IS NULL
        OR "salary_min" <= "salary_max"
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'lead_search_profile_age_range_valid'
      AND conrelid = 'lead_search_profile'::regclass
  ) THEN
    ALTER TABLE "lead_search_profile"
      ADD CONSTRAINT "lead_search_profile_age_range_valid"
      CHECK (
        "age_min" IS NULL
        OR "age_max" IS NULL
        OR "age_min" <= "age_max"
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "lead_search_profile_salary_min_idx"
  ON "lead_search_profile" ("salary_min");
CREATE INDEX IF NOT EXISTS "lead_search_profile_salary_max_idx"
  ON "lead_search_profile" ("salary_max");
CREATE INDEX IF NOT EXISTS "lead_search_profile_age_min_idx"
  ON "lead_search_profile" ("age_min");
CREATE INDEX IF NOT EXISTS "lead_search_profile_age_max_idx"
  ON "lead_search_profile" ("age_max");
CREATE INDEX IF NOT EXISTS "lead_search_profile_gender_idx"
  ON "lead_search_profile" ("gender");
CREATE INDEX IF NOT EXISTS "lead_search_profile_company_size_idx"
  ON "lead_search_profile" ("company_size");
CREATE INDEX IF NOT EXISTS "lead_search_profile_education_level_idx"
  ON "lead_search_profile" ("education_level");
CREATE INDEX IF NOT EXISTS "lead_search_profile_salary_range_idx"
  ON "lead_search_profile" ("salary_min", "salary_max");
CREATE INDEX IF NOT EXISTS "lead_search_profile_age_range_idx"
  ON "lead_search_profile" ("age_min", "age_max");

COMMIT;
