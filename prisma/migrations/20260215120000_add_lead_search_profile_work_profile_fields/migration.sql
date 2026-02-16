BEGIN;

ALTER TABLE "lead_search_profile"
  ADD COLUMN IF NOT EXISTS "excel_knowledge" TEXT,
  ADD COLUMN IF NOT EXISTS "job_role" TEXT,
  ADD COLUMN IF NOT EXISTS "seniority_level" TEXT,
  ADD COLUMN IF NOT EXISTS "current_company" TEXT;

CREATE INDEX IF NOT EXISTS "lead_search_profile_excel_knowledge_idx"
  ON "lead_search_profile" ("excel_knowledge");
CREATE INDEX IF NOT EXISTS "lead_search_profile_job_role_idx"
  ON "lead_search_profile" ("job_role");
CREATE INDEX IF NOT EXISTS "lead_search_profile_seniority_level_idx"
  ON "lead_search_profile" ("seniority_level");
CREATE INDEX IF NOT EXISTS "lead_search_profile_current_company_idx"
  ON "lead_search_profile" ("current_company");

COMMIT;
