-- Evita concorrência de execução simultânea por job_name quando status=running
CREATE UNIQUE INDEX IF NOT EXISTS job_runs_running_lock_idx
  ON public.job_runs (job_name)
  WHERE status = 'running';
