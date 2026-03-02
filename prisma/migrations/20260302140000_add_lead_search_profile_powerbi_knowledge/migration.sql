BEGIN;

ALTER TABLE "lead_search_profile"
  ADD COLUMN IF NOT EXISTS "power_bi_knowledge" TEXT;

CREATE INDEX IF NOT EXISTS "lead_search_profile_power_bi_knowledge_idx"
  ON "lead_search_profile" ("power_bi_knowledge");

COMMIT;
