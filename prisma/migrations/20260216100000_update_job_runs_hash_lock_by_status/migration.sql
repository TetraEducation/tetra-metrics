-- Drop old global unique lock by file hash
DROP INDEX IF EXISTS "uq_job_runs_file_hash";

-- Keep dedupe only for runs that block reprocessing
CREATE UNIQUE INDEX "uq_job_runs_blocking_hash_by_job"
ON "job_runs" ("job_name", "file_hash")
WHERE "status" IN ('PENDING', 'RUNNING', 'COMPLETED');
