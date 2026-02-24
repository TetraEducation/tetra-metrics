import { Inject, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';

import { SUPABASE } from '@/infra/supabase/supabase.provider';
import type {
  FormAnswerBatchItem,
  JobRunSnapshot,
  JobRunStatus,
  LeadSearchProfileUpsertPayload,
  NormalizeLeadSearchProfilePort,
} from '@/modules/leads/application/ports/normalize-lead-search-profile.port';

interface JobRunRow {
  id: string;
  job_name: string;
  status: JobRunStatus;
  cursor_created_at: string | null;
  cursor_id: string | null;
  processed_rows: number;
  processed_leads: number;
  meta: Record<string, unknown> | null;
}

@Injectable()
export class SupabaseNormalizeLeadSearchProfileRepository
  implements NormalizeLeadSearchProfilePort
{
  private readonly logger = new Logger(SupabaseNormalizeLeadSearchProfileRepository.name);

  constructor(@Inject(SUPABASE) private readonly supabase: SupabaseClient) {}

  private isDebugEnabled(): boolean {
    return String(process.env.NORMALIZE_DEBUG ?? 'false') === 'true';
  }

  async resolveQuestionIdsByNormalizedKeys(keys: string[]): Promise<Record<string, string[]>> {
    const normalizedKeys = keys.map((k) => k.trim()).filter(Boolean);
    if (normalizedKeys.length === 0) return {};

    const { data, error } = await this.supabase
      .from('form_questions')
      .select('id,key_normalized')
      // Os headers das planilhas frequentemente viram frases longas (ex.: "qual-seu-sexo-...").
      // Portanto, usamos match por substring (ilike) para capturar essas variações.
      // PostgREST usa wildcard '*' em filtros.
      .or(
        normalizedKeys
          .map((key) => `key_normalized.ilike.*${key.replaceAll('*', '')}*`)
          .join(','),
      );

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao resolver question_ids por key_normalized: ${error.message}`,
      );
    }

    const output: Record<string, string[]> = {};
    for (const key of normalizedKeys) output[key] = [];

    for (const row of data ?? []) {
      const questionKeyNormalized = String(row.key_normalized ?? '');
      if (!questionKeyNormalized) continue;

      const questionId = String(row.id);
      for (const key of normalizedKeys) {
        if (questionKeyNormalized.includes(key)) {
          output[key] = [...(output[key] ?? []), questionId];
        }
      }
    }

    return output;
  }

  async readFormAnswersBatch(params: {
    questionIds: string[];
    cursor: { createdAt: string; id: string } | null;
    limit: number;
  }): Promise<FormAnswerBatchItem[]> {
    if (params.questionIds.length === 0) return [];

    const debug = this.isDebugEnabled();
    const paginationFilter = params.cursor
      ? `created_at.gt.${params.cursor.createdAt},and(created_at.eq.${params.cursor.createdAt},id.gt.${params.cursor.id})`
      : null;

    if (debug) {
      this.logger.debug({
        event: 'normalize_lead_search_profile_read_batch_start',
        questionIdsCount: params.questionIds.length,
        limit: params.limit,
        cursor: params.cursor,
        paginationFilter,
      });
    }

    let query = this.supabase
      .from('form_answers')
      .select(
        'id,question_id,created_at,value_text,value_number,form_submission:form_submissions!inner(lead_id)',
      )
      .in('question_id', params.questionIds)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(params.limit);

    if (params.cursor) {
      query = query.or(paginationFilter!);
    }

    const { data, error } = await query;

    if (error) {
      throw new InternalServerErrorException(`Erro ao ler form_answers em lote: ${error.message}`);
    }

    if (debug) {
      this.logger.debug({
        event: 'normalize_lead_search_profile_read_batch_done',
        returnedRows: (data ?? []).length,
      });
    }

    // Diagnóstico opcional: quando voltar vazio, tentar diferenciar “não existe nada”
    // vs “existe, mas o cursor/paginação está fora do intervalo”.
    if (debug && (data ?? []).length === 0) {
      let countQuery = this.supabase
        .from('form_answers')
        .select('id', { head: true, count: 'exact' })
        .in('question_id', params.questionIds);

      if (params.cursor) {
        countQuery = countQuery.or(paginationFilter!);
      }

      const { count, error: countError } = await countQuery;
      if (countError) {
        this.logger.debug({
          event: 'normalize_lead_search_profile_empty_batch_count_error',
          message: countError.message,
        });
      } else {
        this.logger.debug({
          event: 'normalize_lead_search_profile_empty_batch_count',
          count: count ?? 0,
        });
      }
    }

    return (data ?? []).map((row) => ({
      id: String(row.id),
      questionId: String(row.question_id),
      createdAt: String(row.created_at),
      valueText: (row as { value_text?: string | null }).value_text ?? null,
      valueNumber: (row as { value_number?: number | null }).value_number ?? null,
      leadId: ((row as { form_submission?: { lead_id?: string | null } }).form_submission
        ?.lead_id ?? null) as string | null,
    }));
  }

  async upsertLeadSearchProfile(batch: LeadSearchProfileUpsertPayload[]): Promise<void> {
    if (batch.length === 0) return;

    const payload = batch.map((row) => ({
      lead_id: row.leadId,
      salary_min: row.salaryMin ?? null,
      salary_max: row.salaryMax ?? null,
      age_min: row.ageMin ?? null,
      age_max: row.ageMax ?? null,
      gender: row.gender ?? null,
      company_size: row.companySize ?? null,
      education_level: row.educationLevel ?? null,
      excel_knowledge: row.excelKnowledge ?? null,
      job_role: row.jobRole ?? null,
      seniority_level: row.seniorityLevel ?? null,
      current_company: row.currentCompany ?? null,
    }));

    const { error } = await this.supabase
      .from('lead_search_profile')
      .upsert(payload, { onConflict: 'lead_id' });

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao upsert em lead_search_profile: ${error.message}`,
      );
    }
  }

  async findLatestJobRunByStatuses(params: {
    jobName: string;
    statuses: JobRunStatus[];
  }): Promise<JobRunSnapshot | null> {
    if (params.statuses.length === 0) return null;

    const { data, error } = await this.supabase
      .from('job_runs')
      .select(
        'id,job_name,status,cursor_created_at,cursor_id,processed_rows,processed_leads,meta,started_at',
      )
      .eq('job_name', params.jobName)
      .in('status', params.statuses)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao buscar job_run de retomada: ${error.message}`,
      );
    }

    if (!data) return null;
    return this.toJobRunSnapshot(data as JobRunRow);
  }

  async hasRunningJobRun(jobName: string): Promise<boolean> {
    const { count, error } = await this.supabase
      .from('job_runs')
      .select('id', { head: true, count: 'exact' })
      .eq('job_name', jobName)
      .eq('status', 'running');

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao verificar execução concorrente do job_run: ${error.message}`,
      );
    }

    return (count ?? 0) > 0;
  }

  async failStaleRunningJobRuns(params: {
    jobName: string;
    staleBefore: Date;
    reason: string;
  }): Promise<number> {
    const staleBeforeIso = params.staleBefore.toISOString();
    const { data, error } = await this.supabase
      .from('job_runs')
      .select('id')
      .eq('job_name', params.jobName)
      .eq('status', 'running')
      .lt('updated_at', staleBeforeIso);

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao buscar job_runs stale para recuperação: ${error.message}`,
      );
    }

    const ids = (data ?? [])
      .map((row) => String((row as { id?: unknown }).id ?? ''))
      .filter((value) => value.length > 0);
    if (ids.length === 0) return 0;

    const { error: updateError } = await this.supabase
      .from('job_runs')
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        error_message: params.reason,
      })
      .in('id', ids);

    if (updateError) {
      throw new InternalServerErrorException(
        `Erro ao recuperar job_runs stale: ${updateError.message}`,
      );
    }

    return ids.length;
  }

  async createJobRun(params: {
    jobName: string;
    status: JobRunStatus;
    cursor: { createdAt: string; id: string } | null;
    processedRows: number;
    processedLeads: number;
    meta: Record<string, unknown>;
  }): Promise<JobRunSnapshot> {
    const payload = {
      job_name: params.jobName,
      status: params.status,
      cursor_created_at: params.cursor?.createdAt ?? null,
      cursor_id: params.cursor?.id ?? null,
      processed_rows: params.processedRows,
      processed_leads: params.processedLeads,
      meta: params.meta,
    };

    const { data, error } = await this.supabase
      .from('job_runs')
      .insert(payload)
      .select('id,job_name,status,cursor_created_at,cursor_id,processed_rows,processed_leads,meta')
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new InternalServerErrorException(
          'Já existe execução em andamento para este job (lock lógico ativo).',
        );
      }

      throw new InternalServerErrorException(`Erro ao criar job_run: ${error.message}`);
    }

    return this.toJobRunSnapshot(data as JobRunRow);
  }

  async updateJobRunProgress(params: {
    id: string;
    cursor: { createdAt: string; id: string } | null;
    processedRows: number;
    processedLeads: number;
    meta?: Record<string, unknown>;
  }): Promise<void> {
    const { error } = await this.supabase
      .from('job_runs')
      .update({
        status: 'running',
        cursor_created_at: params.cursor?.createdAt ?? null,
        cursor_id: params.cursor?.id ?? null,
        processed_rows: params.processedRows,
        processed_leads: params.processedLeads,
        ...(params.meta ? { meta: params.meta } : {}),
      })
      .eq('id', params.id);

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao atualizar progresso do job_run: ${error.message}`,
      );
    }
  }

  async markJobRunFailed(params: {
    id: string;
    cursor: { createdAt: string; id: string } | null;
    processedRows: number;
    processedLeads: number;
    errorMessage: string;
    meta?: Record<string, unknown>;
  }): Promise<void> {
    const { error } = await this.supabase
      .from('job_runs')
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        cursor_created_at: params.cursor?.createdAt ?? null,
        cursor_id: params.cursor?.id ?? null,
        processed_rows: params.processedRows,
        processed_leads: params.processedLeads,
        error_message: params.errorMessage,
        ...(params.meta ? { meta: params.meta } : {}),
      })
      .eq('id', params.id);

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao marcar job_run como failed: ${error.message}`,
      );
    }
  }

  async markJobRunCompleted(params: {
    id: string;
    cursor: { createdAt: string; id: string } | null;
    processedRows: number;
    processedLeads: number;
    meta?: Record<string, unknown>;
  }): Promise<void> {
    const { error } = await this.supabase
      .from('job_runs')
      .update({
        status: 'completed',
        finished_at: new Date().toISOString(),
        cursor_created_at: params.cursor?.createdAt ?? null,
        cursor_id: params.cursor?.id ?? null,
        processed_rows: params.processedRows,
        processed_leads: params.processedLeads,
        ...(params.meta ? { meta: params.meta } : {}),
      })
      .eq('id', params.id);

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao marcar job_run como completed: ${error.message}`,
      );
    }
  }

  private toJobRunSnapshot(row: JobRunRow): JobRunSnapshot {
    return {
      id: row.id,
      jobName: row.job_name,
      status: row.status,
      cursor:
        row.cursor_created_at && row.cursor_id
          ? {
              createdAt: row.cursor_created_at,
              id: row.cursor_id,
            }
          : null,
      processedRows: row.processed_rows,
      processedLeads: row.processed_leads,
      meta: row.meta ?? {},
    };
  }
}
