-- CreateEnum
CREATE TYPE "JobRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "job_runs" (
    "job_run_id" TEXT NOT NULL,
    "job_name" TEXT NOT NULL,
    "status" "JobRunStatus" NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_hash" TEXT NOT NULL,
    "source_system" "LeadSourceSystem" NOT NULL,
    "tag_key" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "last_processed_row" INTEGER NOT NULL DEFAULT 0,
    "total_rows" INTEGER,
    "processed_rows" INTEGER NOT NULL DEFAULT 0,
    "processed_ok" INTEGER NOT NULL DEFAULT 0,
    "processed_errors" INTEGER NOT NULL DEFAULT 0,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("job_run_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_job_runs_file_hash" ON "job_runs"("file_hash");

-- CreateIndex
CREATE INDEX "idx_job_runs_status" ON "job_runs"("status");

-- CreateIndex
CREATE INDEX "idx_job_runs_created_at" ON "job_runs"("created_at");

-- CreateIndex
CREATE INDEX "idx_job_runs_job_name_status" ON "job_runs"("job_name", "status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_job_runs_running_job_lock"
ON "job_runs"("job_name")
WHERE "status" = 'RUNNING';
