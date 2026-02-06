import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';

import { SUPABASE } from '@/infra/supabase/supabase.provider';
import type { JobRunStatus } from '@/modules/leads/application/ports/normalize-lead-search-profile.port';

export type JobRunRow = {
  id: string;
  job_name: string;
  status: JobRunStatus;
  started_at: string;
  finished_at: string | null;
  processed_rows: number;
  processed_leads: number;
  error_message: string | null;
  meta: Record<string, unknown> | null;
  cursor_created_at: string | null;
  cursor_id: string | null;
};

@Injectable()
export class JobRunsService {
  constructor(@Inject(SUPABASE) private readonly supabase: SupabaseClient) {}

  async hasRunningJob(jobName: string): Promise<boolean> {
    const { count, error } = await this.supabase
      .from('job_runs')
      .select('id', { head: true, count: 'exact' })
      .eq('job_name', jobName)
      .eq('status', 'running');

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao verificar job_run em andamento: ${error.message}`,
      );
    }

    return (count ?? 0) > 0;
  }

  async listJobRuns(params: {
    jobName?: string;
    status?: JobRunStatus;
    limit: number;
  }): Promise<JobRunRow[]> {
    let query = this.supabase
      .from('job_runs')
      .select(
        'id,job_name,status,started_at,finished_at,processed_rows,processed_leads,error_message,meta,cursor_created_at,cursor_id',
      )
      .order('started_at', { ascending: false })
      .limit(params.limit);

    if (params.jobName) query = query.eq('job_name', params.jobName);
    if (params.status) query = query.eq('status', params.status);

    const { data, error } = await query;

    if (error) {
      throw new InternalServerErrorException(`Erro ao listar job_runs: ${error.message}`);
    }

    return (data ?? []) as JobRunRow[];
  }
}

