import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';

import { SUPABASE } from '@/infra/supabase/supabase.provider';
import type { LeadsRepositoryPort } from '@/modules/leads/application/ports/leads-repository.port';
import type { Lead, LeadIdentifier } from '@/modules/leads/domain/lead';
import { normalizeEmail, normalizeText } from '@/modules/imports/application/utils/normalize';

type LeadRow = {
  id: string;
  name: string | null;
  created_at: string;
};

type LeadIdentifierRow = {
  id: string;
  lead_id: string;
  type: string;
  value_norm: string;
};

@Injectable()
export class SupabaseLeadsRepository implements LeadsRepositoryPort {
  constructor(@Inject(SUPABASE) private readonly supabase: SupabaseClient) {}

  async findIdentifiersByValues(values: string[]): Promise<LeadIdentifier[]> {
    if (values.length === 0) return [];

    const { data, error } = await this.supabase
      .from('lead_identifiers')
      .select('id, lead_id, type, value_norm')
      .in('value_norm', values);

    if (error) throw error;
    return (data ?? []).map(this.mapIdentifier);
  }

  async createLead(payload: { name?: string | null }): Promise<Lead> {
    const { data, error } = await this.supabase
      .from('leads')
      .insert({ name: payload.name ?? null })
      .select('id, name, created_at')
      .single();

    if (error || !data) throw error ?? new Error('Failed to create lead');
    return this.mapLead(data);
  }

  async attachIdentifiers(
    leadId: string,
    identifiers: Array<{ type: 'email' | 'phone'; valueNorm: string }>,
  ): Promise<void> {
    if (identifiers.length === 0) return;

    const payload = identifiers.map((identifier) => ({
      lead_id: leadId,
      type: identifier.type,
      value_norm: identifier.valueNorm,
    }));

    const { error } = await this.supabase.from('lead_identifiers').insert(payload);
    if (error) throw error;
  }

  async updateLead(id: string, payload: { name?: string | null }): Promise<void> {
    const { error } = await this.supabase
      .from('leads')
      .update({ name: payload.name ?? null })
      .eq('id', id);
    if (error) throw error;
  }

  async reassignIdentifiers(targetLeadId: string, sourceLeadIds: string[]): Promise<void> {
    if (sourceLeadIds.length === 0) return;

    const { error } = await this.supabase
      .from('lead_identifiers')
      .update({ lead_id: targetLeadId })
      .in('lead_id', sourceLeadIds);

    if (error) throw error;
  }

  async deleteLeads(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    const { error } = await this.supabase.from('leads').delete().in('id', ids);
    if (error) throw error;
  }

  async getLeadById(id: string): Promise<Lead> {
    const { data, error } = await this.supabase
      .from('leads')
      .select('id, name, created_at')
      .eq('id', id)
      .single();

    if (error || !data) throw error ?? new Error('Lead not found');
    return this.mapLead(data);
  }

  async findLeadBySearch(params: {
    name?: string;
    email?: string;
    phone?: string;
  }): Promise<string | null> {
    if (params.email) {
      const emailNorm = normalizeEmail(params.email);
      const { data, error } = await this.supabase
        .from('lead_identifiers')
        .select('lead_id')
        .eq('type', 'email')
        .eq('value_normalized', emailNorm)
        .maybeSingle();

      if (error) throw error;
      if (data) return data.lead_id;
    }
    if (params.phone) {
      const phoneNorm = params.phone.replace(/\D+/g, '');
      if (phoneNorm) {
        const { data, error } = await this.supabase
          .from('lead_identifiers')
          .select('lead_id')
          .eq('type', 'phone')
          .eq('value_normalized', phoneNorm)
          .maybeSingle();

        if (error) throw error;
        if (data) return data.lead_id;
      }
    }

    if (params.name) {
      const nameSearch = normalizeText(params.name);
      if (nameSearch) {
        const { data, error } = await this.supabase
          .from('leads')
          .select('id')
          .ilike('full_name', `%${nameSearch}%`)
          .limit(1)
          .maybeSingle();

        if (error) throw error;
        if (data) return data.id;
      }
    }

    return null;
  }

  async getLeadDetailById(leadId: string): Promise<unknown> {
    const { data: lead, error: leadError } = await this.supabase
      .from('leads')
      .select('id, full_name, first_contact_at, last_activity_at, created_at, updated_at')
      .eq('id', leadId)
      .single();

    if (leadError || !lead) {
      throw leadError ?? new Error('Lead not found');
    }

    const { data: identifiers } = await this.supabase
      .from('lead_identifiers')
      .select('id, type, value, value_normalized, is_primary, created_at')
      .eq('lead_id', leadId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true });

    const { data: sources } = await this.supabase
      .from('lead_sources')
      .select('id, source_system, source_ref, first_seen_at, last_seen_at, meta')
      .eq('lead_id', leadId)
      .order('first_seen_at', { ascending: true });

    const { data: leadTags } = await this.supabase
      .from('lead_tags')
      .select('tag_id, source_system, source_ref, first_seen_at, last_seen_at, meta')
      .eq('lead_id', leadId)
      .order('first_seen_at', { ascending: true });

    const tagIds = leadTags?.map((lt) => lt.tag_id) ?? [];
    const { data: tags } =
      tagIds.length > 0
        ? await this.supabase.from('tags').select('id, key, name, category').in('id', tagIds)
        : { data: null };
    const tagsMap = new Map((tags ?? []).map((t) => [t.id, t]));

    const { data: events } = await this.supabase
      .from('lead_events')
      .select('id, event_type, source_system, occurred_at, ingested_at, dedupe_key, payload')
      .eq('lead_id', leadId)
      .order('occurred_at', { ascending: false });

    const { data: funnelEntries } = await this.supabase
      .from('lead_funnel_entries')
      .select(
        'id, funnel_id, current_stage_id, status, source_system, external_ref, first_seen_at, last_seen_at, meta',
      )
      .eq('lead_id', leadId)
      .order('first_seen_at', { ascending: true });

    const funnelIds = [...new Set((funnelEntries ?? []).map((fe) => fe.funnel_id))];
    const { data: funnels } =
      funnelIds.length > 0
        ? await this.supabase.from('funnels').select('id, name').in('id', funnelIds)
        : { data: null };
    const funnelsMap = new Map((funnels ?? []).map((f) => [f.id, f]));

    const stageIds = (funnelEntries ?? [])
      .map((fe) => fe.current_stage_id)
      .filter((id): id is string => id !== null);
    const { data: stages } =
      stageIds.length > 0
        ? await this.supabase.from('funnel_stages').select('id, name').in('id', stageIds)
        : { data: null };
    const stagesMap = new Map((stages ?? []).map((s) => [s.id, s]));

    const { data: formSubmissions } = await this.supabase
      .from('form_submissions')
      .select('id, form_schema_id, submitted_at, source_ref, dedupe_key, raw_payload, created_at')
      .eq('lead_id', leadId)
      .order('submitted_at', { ascending: false });

    const formSchemaIds = [...new Set((formSubmissions ?? []).map((fs) => fs.form_schema_id))];
    const { data: formSchemas } =
      formSchemaIds.length > 0
        ? await this.supabase
            .from('form_schemas')
            .select('id, name, source_system, source_ref, created_at')
            .in('id', formSchemaIds)
        : { data: null };
    const formSchemasMap = new Map((formSchemas ?? []).map((fs) => [fs.id, fs]));

    const submissionIds = (formSubmissions ?? []).map((fs) => fs.id);
    const { data: formAnswers } =
      submissionIds.length > 0
        ? await this.supabase
            .from('form_answers')
            .select(
              'id, form_submission_id, question_id, value_text, value_number, value_bool, value_json, created_at',
            )
            .in('form_submission_id', submissionIds)
        : { data: null };

    const questionIds = [...new Set((formAnswers ?? []).map((fa) => fa.question_id))];
    const { data: formQuestions } =
      questionIds.length > 0
        ? await this.supabase
            .from('form_questions')
            .select('id, form_schema_id, key, label, position, data_type')
            .in('id', questionIds)
        : { data: null };
    const formQuestionsMap = new Map((formQuestions ?? []).map((fq) => [fq.id, fq]));

    const answersBySubmission = new Map<string, typeof formAnswers>();
    for (const answer of formAnswers ?? []) {
      const existing = answersBySubmission.get(answer.form_submission_id) ?? [];
      existing.push(answer);
      answersBySubmission.set(answer.form_submission_id, existing);
    }

    return {
      id: lead.id,
      full_name: lead.full_name,
      first_contact_at: lead.first_contact_at,
      last_activity_at: lead.last_activity_at,
      created_at: lead.created_at,
      updated_at: lead.updated_at,
      identifiers: (identifiers ?? []).map((id) => ({
        id: id.id,
        type: id.type,
        value: id.value,
        value_normalized: id.value_normalized,
        is_primary: id.is_primary,
        created_at: id.created_at,
      })),
      sources: (sources ?? []).map((src) => ({
        id: src.id,
        source_system: src.source_system,
        source_ref: src.source_ref,
        first_seen_at: src.first_seen_at,
        last_seen_at: src.last_seen_at,
        meta: src.meta,
      })),
      tags: (leadTags ?? []).map((lt) => {
        const tag = tagsMap.get(lt.tag_id);
        return {
          tag_id: lt.tag_id,
          tag_key: tag?.key ?? null,
          tag_name: tag?.name ?? null,
          tag_category: tag?.category ?? null,
          source_system: lt.source_system,
          source_ref: lt.source_ref,
          first_seen_at: lt.first_seen_at,
          last_seen_at: lt.last_seen_at,
          meta: lt.meta,
        };
      }),
      events: (events ?? []).map((ev) => ({
        id: ev.id,
        event_type: ev.event_type,
        source_system: ev.source_system,
        occurred_at: ev.occurred_at,
        ingested_at: ev.ingested_at,
        dedupe_key: ev.dedupe_key,
        payload: ev.payload,
      })),
      funnel_entries: (funnelEntries ?? []).map((fe) => {
        const funnel = funnelsMap.get(fe.funnel_id);
        const stage = fe.current_stage_id ? stagesMap.get(fe.current_stage_id) : null;
        return {
          id: fe.id,
          funnel_id: fe.funnel_id,
          funnel_name: funnel?.name ?? null,
          current_stage_id: fe.current_stage_id,
          current_stage_name: stage?.name ?? null,
          status: fe.status,
          source_system: fe.source_system,
          external_ref: fe.external_ref,
          first_seen_at: fe.first_seen_at,
          last_seen_at: fe.last_seen_at,
          meta: fe.meta,
        };
      }),
      surveys: (formSubmissions ?? []).map((fs) => {
        const schema = formSchemasMap.get(fs.form_schema_id);
        const answers = answersBySubmission.get(fs.id) ?? [];
        return {
          submission_id: fs.id,
          form_schema_id: fs.form_schema_id,
          form_name: schema?.name ?? null,
          form_source_system: schema?.source_system ?? null,
          submitted_at: fs.submitted_at,
          source_ref: fs.source_ref,
          dedupe_key: fs.dedupe_key,
          created_at: fs.created_at,
          raw_payload: fs.raw_payload,
          answers: answers
            .map((ans) => {
              const question = formQuestionsMap.get(ans.question_id);
              return {
                answer_id: ans.id,
                question_id: ans.question_id,
                question_key: question?.key ?? null,
                question_label: question?.label ?? null,
                question_position: question?.position ?? null,
                question_data_type: question?.data_type ?? null,
                value_text: ans.value_text,
                value_number: ans.value_number,
                value_bool: ans.value_bool,
                value_json: ans.value_json,
                created_at: ans.created_at,
              };
            })
            .sort((a, b) => (a.question_position ?? 0) - (b.question_position ?? 0)),
        };
      }),
    };
  }

  private mapLead(row: LeadRow): Lead {
    return {
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
    };
  }

  private mapIdentifier(row: LeadIdentifierRow): LeadIdentifier {
    return {
      id: row.id,
      leadId: row.lead_id,
      type: row.type as LeadIdentifier['type'],
      valueNorm: row.value_norm,
    };
  }
}
