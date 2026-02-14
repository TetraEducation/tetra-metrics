/*
  Warnings:

  - The primary key for the `lead_identifiers` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `lead_identifiers` table. All the data in the column will be lost.
  - The primary key for the `leads` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `leads` table. All the data in the column will be lost.
  - The required column `lead_identifier_id` was added to the `lead_identifiers` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - Changed the type of `type` on the `lead_identifiers` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - The required column `lead_id` was added to the `leads` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- CreateEnum
CREATE TYPE "LeadIdentifierType" AS ENUM ('EMAIL', 'PHONE');

-- CreateEnum
CREATE TYPE "LeadSourceSystem" AS ENUM ('CLINT', 'SPREADSHEET', 'ACTIVECAMPAIGN', 'FORM');

-- CreateEnum
CREATE TYPE "LeadEventType" AS ENUM ('TAG_ADDED', 'LEAD_IMPORTED');

-- CreateEnum
CREATE TYPE "FormQuestionDataType" AS ENUM ('text', 'number', 'bool', 'date', 'select', 'unknown');

-- DropForeignKey
ALTER TABLE "lead_identifiers" DROP CONSTRAINT "lead_identifiers_lead_id_fkey";

-- DropIndex
DROP INDEX "uq_lead_primary_email";

-- AlterTable
ALTER TABLE "lead_identifiers" DROP CONSTRAINT "lead_identifiers_pkey",
DROP COLUMN "id",
ADD COLUMN     "lead_identifier_id" TEXT NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "lead_id" SET DATA TYPE TEXT,
DROP COLUMN "type",
ADD COLUMN     "type" "LeadIdentifierType" NOT NULL,
ADD CONSTRAINT "lead_identifiers_pkey" PRIMARY KEY ("lead_identifier_id");

-- AlterTable
ALTER TABLE "leads" DROP CONSTRAINT "leads_pkey",
DROP COLUMN "id",
ADD COLUMN     "lead_id" TEXT NOT NULL,
ADD CONSTRAINT "leads_pkey" PRIMARY KEY ("lead_id");

-- CreateTable
CREATE TABLE "lead_sources" (
    "lead_source_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "source_system" "LeadSourceSystem" NOT NULL,
    "source_ref" TEXT NOT NULL,
    "first_seen_at" TIMESTAMPTZ(6) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL,
    "meta" JSONB NOT NULL,

    CONSTRAINT "lead_sources_pkey" PRIMARY KEY ("lead_source_id")
);

-- CreateTable
CREATE TABLE "tags" (
    "tag_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "key_normalized" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("tag_id")
);

-- CreateTable
CREATE TABLE "tag_aliases" (
    "tag_alias_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,
    "source_system" "LeadSourceSystem" NOT NULL,
    "source_key" TEXT NOT NULL,

    CONSTRAINT "tag_aliases_pkey" PRIMARY KEY ("tag_alias_id")
);

-- CreateTable
CREATE TABLE "lead_tags" (
    "lead_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,
    "source_system" "LeadSourceSystem" NOT NULL,
    "source_ref" TEXT,
    "first_seen_at" TIMESTAMPTZ(6) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL,
    "meta" JSONB NOT NULL,

    CONSTRAINT "pk_lead_tags" PRIMARY KEY ("lead_id","tag_id","source_system")
);

-- CreateTable
CREATE TABLE "form_schemas" (
    "form_schema_id" TEXT NOT NULL,
    "source_system" "LeadSourceSystem" NOT NULL,
    "source_ref" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_normalized" TEXT NOT NULL,
    "tag_id" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_schemas_pkey" PRIMARY KEY ("form_schema_id")
);

-- CreateTable
CREATE TABLE "form_questions" (
    "id" TEXT NOT NULL,
    "form_schema_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "key_normalized" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "data_type" "FormQuestionDataType" NOT NULL DEFAULT 'text',
    "meta" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_submissions" (
    "id" TEXT NOT NULL,
    "form_schema_id" TEXT NOT NULL,
    "lead_id" TEXT,
    "submitted_at" TIMESTAMPTZ(6),
    "source_ref" TEXT,
    "dedupe_key" TEXT,
    "raw_payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_answers" (
    "form_answer_id" TEXT NOT NULL,
    "form_submission_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "value_text" TEXT,
    "value_number" DECIMAL(10,2),
    "value_bool" BOOLEAN,
    "value_json" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_answers_pkey" PRIMARY KEY ("form_answer_id")
);

-- CreateTable
CREATE TABLE "lead_events" (
    "event_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "event_type" "LeadEventType" NOT NULL,
    "source_system" "LeadSourceSystem" NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "ingested_at" TIMESTAMPTZ(6) NOT NULL,
    "dedupe_key" TEXT,
    "payload" JSONB NOT NULL,

    CONSTRAINT "lead_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateIndex
CREATE INDEX "idx_lead_sources_lead_id" ON "lead_sources"("lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_lead_sources_system_ref" ON "lead_sources"("source_system", "source_ref");

-- CreateIndex
CREATE UNIQUE INDEX "uq_tags_key_normalized" ON "tags"("key_normalized");

-- CreateIndex
CREATE INDEX "idx_tag_aliases_tag_id" ON "tag_aliases"("tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_tag_aliases_source_system_key" ON "tag_aliases"("source_system", "source_key");

-- CreateIndex
CREATE INDEX "idx_lead_tags_tag_id" ON "lead_tags"("tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "form_schemas_source_system_source_ref_unique" ON "form_schemas"("source_system", "source_ref");

-- CreateIndex
CREATE INDEX "form_questions_form_schema_id_idx" ON "form_questions"("form_schema_id");

-- CreateIndex
CREATE UNIQUE INDEX "form_questions_form_schema_id_key_normalized_unique" ON "form_questions"("form_schema_id", "key_normalized");

-- CreateIndex
CREATE INDEX "form_submissions_form_schema_id_idx" ON "form_submissions"("form_schema_id");

-- CreateIndex
CREATE INDEX "form_submissions_lead_id_idx" ON "form_submissions"("lead_id");

-- CreateIndex
CREATE INDEX "form_submissions_dedupe_key_idx" ON "form_submissions"("dedupe_key");

-- CreateIndex
CREATE UNIQUE INDEX "form_submissions_form_schema_id_dedupe_key_unique" ON "form_submissions"("form_schema_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "form_answers_form_submission_id_idx" ON "form_answers"("form_submission_id");

-- CreateIndex
CREATE INDEX "form_answers_question_id_idx" ON "form_answers"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "form_answers_form_submission_id_question_id_unique" ON "form_answers"("form_submission_id", "question_id");

-- CreateIndex
CREATE INDEX "idx_lead_events_lead_id" ON "lead_events"("lead_id");

-- CreateIndex
CREATE INDEX "idx_lead_events_source_system" ON "lead_events"("source_system");

-- CreateIndex
CREATE INDEX "idx_lead_events_dedupe_key" ON "lead_events"("dedupe_key");

-- CreateIndex
CREATE UNIQUE INDEX "uq_lead_events_dedupe_key" ON "lead_events"("dedupe_key");

-- CreateIndex
CREATE UNIQUE INDEX "uq_lead_identifiers_type_value_norm" ON "lead_identifiers"("type", "value_normalized");

-- AddForeignKey
ALTER TABLE "lead_identifiers" ADD CONSTRAINT "lead_identifiers_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("lead_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_sources" ADD CONSTRAINT "lead_sources_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("lead_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tag_aliases" ADD CONSTRAINT "tag_aliases_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("tag_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_tags" ADD CONSTRAINT "lead_tags_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("lead_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_tags" ADD CONSTRAINT "lead_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("tag_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_schemas" ADD CONSTRAINT "form_schemas_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("tag_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_questions" ADD CONSTRAINT "form_questions_form_schema_id_fkey" FOREIGN KEY ("form_schema_id") REFERENCES "form_schemas"("form_schema_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_form_schema_id_fkey" FOREIGN KEY ("form_schema_id") REFERENCES "form_schemas"("form_schema_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("lead_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_answers" ADD CONSTRAINT "form_answers_form_submission_id_fkey" FOREIGN KEY ("form_submission_id") REFERENCES "form_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_answers" ADD CONSTRAINT "form_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "form_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_events" ADD CONSTRAINT "lead_events_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("lead_id") ON DELETE CASCADE ON UPDATE CASCADE;
