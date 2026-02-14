-- Consolidate duplicated questions across schemas and move to global question identity.
-- Target behavior:
-- 1) one row in form_questions per key_normalized
-- 2) explicit N:N relation between form_schemas and form_questions

BEGIN;

CREATE TABLE IF NOT EXISTS "form_schema_questions" (
    "form_schema_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_schema_questions_pkey" PRIMARY KEY ("form_schema_id","question_id")
);

CREATE INDEX IF NOT EXISTS "form_schema_questions_question_id_idx"
  ON "form_schema_questions"("question_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'form_schema_questions_form_schema_id_fkey'
      AND conrelid = 'form_schema_questions'::regclass
  ) THEN
    ALTER TABLE "form_schema_questions"
      ADD CONSTRAINT "form_schema_questions_form_schema_id_fkey"
      FOREIGN KEY ("form_schema_id") REFERENCES "form_schemas"("form_schema_id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'form_schema_questions_question_id_fkey'
      AND conrelid = 'form_schema_questions'::regclass
  ) THEN
    ALTER TABLE "form_schema_questions"
      ADD CONSTRAINT "form_schema_questions_question_id_fkey"
      FOREIGN KEY ("question_id") REFERENCES "form_questions"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill links from legacy form_questions.form_schema_id.
INSERT INTO "form_schema_questions" ("form_schema_id", "question_id")
SELECT DISTINCT fq."form_schema_id", fq."id"
FROM "form_questions" fq
WHERE fq."form_schema_id" IS NOT NULL
ON CONFLICT ("form_schema_id","question_id") DO NOTHING;

WITH ranked_questions AS (
  SELECT
    fq."id",
    fq."key_normalized",
    fq."created_at",
    ROW_NUMBER() OVER (
      PARTITION BY fq."key_normalized"
      ORDER BY fq."created_at" ASC, fq."id" ASC
    ) AS row_num
  FROM "form_questions" fq
),
duplicate_mapping AS (
  SELECT
    duplicate."id" AS duplicate_id,
    canonical."id" AS canonical_id
  FROM ranked_questions duplicate
  JOIN ranked_questions canonical
    ON canonical."key_normalized" = duplicate."key_normalized"
   AND canonical.row_num = 1
  WHERE duplicate.row_num > 1
),
link_backfill AS (
  INSERT INTO "form_schema_questions" ("form_schema_id", "question_id")
  SELECT DISTINCT fsq."form_schema_id", dm.canonical_id
  FROM "form_schema_questions" fsq
  JOIN duplicate_mapping dm
    ON dm.duplicate_id = fsq."question_id"
  ON CONFLICT ("form_schema_id","question_id") DO NOTHING
  RETURNING 1
),
conflicting_answers AS (
  SELECT fa."form_answer_id"
  FROM "form_answers" fa
  JOIN duplicate_mapping dm
    ON dm.duplicate_id = fa."question_id"
  JOIN "form_answers" canonical_fa
    ON canonical_fa."form_submission_id" = fa."form_submission_id"
   AND canonical_fa."question_id" = dm.canonical_id
),
deleted_conflicting_answers AS (
  DELETE FROM "form_answers"
  WHERE "form_answer_id" IN (SELECT "form_answer_id" FROM conflicting_answers)
  RETURNING 1
),
updated_answers AS (
  UPDATE "form_answers" fa
  SET "question_id" = dm.canonical_id
  FROM duplicate_mapping dm
  WHERE fa."question_id" = dm.duplicate_id
  RETURNING 1
),
deleted_duplicate_links AS (
  DELETE FROM "form_schema_questions" fsq
  USING duplicate_mapping dm
  WHERE fsq."question_id" = dm.duplicate_id
  RETURNING 1
)
DELETE FROM "form_questions" fq
USING duplicate_mapping dm
WHERE fq."id" = dm.duplicate_id;

DROP INDEX IF EXISTS "form_questions_form_schema_id_key_normalized_unique";
DROP INDEX IF EXISTS "form_questions_form_schema_id_idx";

ALTER TABLE "form_questions"
  DROP CONSTRAINT IF EXISTS "form_questions_form_schema_id_key_normalized_unique";
ALTER TABLE "form_questions"
  DROP CONSTRAINT IF EXISTS "form_questions_form_schema_id_fkey";
ALTER TABLE "form_questions"
  DROP CONSTRAINT IF EXISTS "form_questions_form_schema_id_not_null";

CREATE UNIQUE INDEX IF NOT EXISTS "form_questions_key_normalized_unique"
  ON "form_questions"("key_normalized");

ALTER TABLE "form_questions"
  DROP COLUMN IF EXISTS "form_schema_id";

COMMIT;
