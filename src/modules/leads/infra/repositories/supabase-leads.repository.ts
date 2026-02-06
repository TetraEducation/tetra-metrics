import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';

import { SUPABASE } from '@/infra/supabase/supabase.provider';
import { normalizeEmail, normalizeText } from '@/modules/imports/application/utils/normalize';
import type {
  LeadListingItem,
  LeadsListingResult,
  LeadsListingSearchDto,
} from '@/modules/leads/application/dto/leads-listing.dto';
import type { LeadsRepositoryPort } from '@/modules/leads/application/ports/leads-repository.port';
import type { Lead, LeadIdentifier } from '@/modules/leads/domain/lead';

type LeadRow = {
  id: string;
  full_name: string | null;
  created_at: string;
};

type LeadIdentifierRow = {
  id: string;
  lead_id: string;
  type: string;
  value_normalized: string;
};

type LeadListingRow = {
  id: string;
  full_name: string | null;
  last_activity_at: string | null;
  lead_identifiers?: Array<{
    type: string;
    value: string | null;
    is_primary: boolean | null;
    created_at: string | null;
  }>;
};

@Injectable()
export class SupabaseLeadsRepository implements LeadsRepositoryPort {
  constructor(@Inject(SUPABASE) private readonly supabase: SupabaseClient) {}

  async findIdentifiersByValues(values: string[]): Promise<LeadIdentifier[]> {
    if (values.length === 0) return [];

    const { data, error } = await this.supabase
      .from('lead_identifiers')
      .select('id, lead_id, type, value_normalized')
      .in('value_normalized', values);

    if (error) throw error;
    return (data ?? []).map(this.mapIdentifier);
  }

  async createLead(payload: { name?: string | null }): Promise<Lead> {
    const { data, error } = await this.supabase
      .from('leads')
      .insert({ full_name: payload.name ?? null })
      .select('id, full_name, created_at')
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
      value_normalized: identifier.valueNorm,
    }));

    const { error } = await this.supabase.from('lead_identifiers').insert(payload);
    if (error) throw error;
  }

  async updateLead(id: string, payload: { name?: string | null }): Promise<void> {
    const { error } = await this.supabase
      .from('leads')
      .update({ full_name: payload.name ?? null })
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
      .select('id, full_name, created_at')
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

  async listLeads(params: LeadsListingSearchDto): Promise<LeadsListingResult<LeadListingItem>> {
    const page = params.page && params.page > 0 ? params.page : 1;
    const perPage = params.perPage && params.perPage > 0 ? params.perPage : 20;
    const orderBy = params.orderBy ?? 'last_activity_at';
    const orderDirection = params.orderDirection ?? 'desc';

    const tagIds = await this.resolveTagIds(params);
    if (tagIds && tagIds.length === 0) {
      return { data: [], page, perPage, total: 0 };
    }

    const salaryQuestionIds = await this.resolveSalaryQuestionIds(params);
    if (salaryQuestionIds && salaryQuestionIds.length === 0) {
      return { data: [], page, perPage, total: 0 };
    }

    const leadIdsFilter = await this.resolveLeadIdsByFilters(params);
    if (leadIdsFilter && leadIdsFilter.length === 0) {
      return { data: [], page, perPage, total: 0 };
    }

    const selectParts = [
      'id',
      'full_name',
      'last_activity_at',
      'lead_identifiers(type, value, is_primary, created_at)',
    ];
    if (tagIds) {
      selectParts.push('lead_tags!inner(tag_id)');
    }
    if (salaryQuestionIds) {
      // Para filtrar por salário textual, só precisamos do join; não precisamos retornar value_text.
      selectParts.push('form_submissions!inner(id, form_answers!inner(question_id))');
    }

    const shouldAvoidExactCount =
      Boolean(params.name) || Boolean(tagIds) || Boolean(salaryQuestionIds) || Boolean(params.lastActivityFrom) || Boolean(params.lastActivityTo);
    const countStrategy = shouldAvoidExactCount ? 'planned' : 'exact';

    let query = this.supabase
      .from('leads')
      .select(selectParts.join(', '), { count: countStrategy });

    if (params.name) {
      const nameSearch = normalizeText(params.name);
      if (nameSearch) {
        query = query.ilike('full_name', `%${nameSearch}%`);
      }
    }

    if (params.lastActivityFrom) {
      query = query.gte('last_activity_at', params.lastActivityFrom);
    }

    if (params.lastActivityTo) {
      query = query.lte('last_activity_at', params.lastActivityTo);
    }

    if (tagIds) {
      query = query.in('lead_tags.tag_id', tagIds);
    }

    if (salaryQuestionIds) {
      query = query.in('form_submissions.form_answers.question_id', salaryQuestionIds);
      const salaryPatterns = this.buildSalaryTextPatterns(params);
      for (const pattern of salaryPatterns) {
        query = query.ilike('form_submissions.form_answers.value_text', pattern);
      }
    }

    if (leadIdsFilter) {
      query = query.in('id', leadIdsFilter);
    }

    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    const { data, error, count } = await query
      .order(orderBy, { ascending: orderDirection === 'asc' })
      .range(from, to);

    if (error) {
      throw error;
    }

    const leads = (data ?? []) as unknown as LeadListingRow[];
    const items = leads.map((lead) => this.mapLeadListing(lead));

    return {
      data: items,
      page,
      perPage,
      total: count ?? 0,
    };
  }

  async listLeadIds(params: LeadsListingSearchDto): Promise<string[]> {
    const orderBy = params.orderBy ?? 'last_activity_at';
    const orderDirection = params.orderDirection ?? 'desc';

    const tagIds = await this.resolveTagIds(params);
    if (tagIds && tagIds.length === 0) {
      return [];
    }

    const salaryQuestionIds = await this.resolveSalaryQuestionIds(params);
    if (salaryQuestionIds && salaryQuestionIds.length === 0) {
      return [];
    }

    const leadIdsFilter = await this.resolveLeadIdsByFilters(params);
    if (leadIdsFilter && leadIdsFilter.length === 0) {
      return [];
    }

    const selectParts = ['id'];
    if (tagIds) {
      selectParts.push('lead_tags!inner(tag_id)');
    }
    if (salaryQuestionIds) {
      // Para filtrar por salário textual, só precisamos do join; não precisamos selecionar value_text.
      selectParts.push('form_submissions!inner(id, form_answers!inner(question_id))');
    }

    let query = this.supabase.from('leads').select(selectParts.join(', '));

    if (params.name) {
      const nameSearch = normalizeText(params.name);
      if (nameSearch) {
        query = query.ilike('full_name', `%${nameSearch}%`);
      }
    }

    if (params.lastActivityFrom) {
      query = query.gte('last_activity_at', params.lastActivityFrom);
    }

    if (params.lastActivityTo) {
      query = query.lte('last_activity_at', params.lastActivityTo);
    }

    if (tagIds) {
      query = query.in('lead_tags.tag_id', tagIds);
    }

    if (salaryQuestionIds) {
      query = query.in('form_submissions.form_answers.question_id', salaryQuestionIds);
      const salaryPatterns = this.buildSalaryTextPatterns(params);
      for (const pattern of salaryPatterns) {
        query = query.ilike('form_submissions.form_answers.value_text', pattern);
      }
    }

    if (leadIdsFilter) {
      query = query.in('id', leadIdsFilter);
    }

    query = query.order(orderBy, { ascending: orderDirection === 'asc' });

    const pageSize = 1000;
    const ids: string[] = [];
    let page = 0;

    while (true) {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const { data, error } = await query.range(from, to);

      if (error) {
        throw error;
      }

      const chunk = (data ?? []) as unknown as Array<{ id: string }>;
      if (chunk.length === 0) {
        break;
      }

      ids.push(...chunk.map((row) => row.id));

      if (chunk.length < pageSize) {
        break;
      }

      page += 1;
    }

    return ids;
  }

  private mapLead(row: LeadRow): Lead {
    return {
      id: row.id,
      name: row.full_name,
      createdAt: row.created_at,
    };
  }

  private mapIdentifier(row: LeadIdentifierRow): LeadIdentifier {
    return {
      id: row.id,
      leadId: row.lead_id,
      type: row.type as LeadIdentifier['type'],
      valueNorm: row.value_normalized,
    };
  }

  private async resolveLeadIdsByFilters(params: LeadsListingSearchDto): Promise<string[] | null> {
    let leadIds: string[] | null = null;

    const applyFilter = (ids: string[]) => {
      leadIds = leadIds ? leadIds.filter((id) => ids.includes(id)) : ids;
    };

    if (params.email) {
      const emailNorm = normalizeEmail(params.email);
      const { data, error } = await this.supabase
        .from('lead_identifiers')
        .select('lead_id')
        .eq('type', 'email')
        .eq('value_normalized', emailNorm);

      if (error) throw error;
      const ids = (data ?? []).map((row) => row.lead_id);
      applyFilter(ids);
    }

    if (params.phone) {
      const phoneNorm = params.phone.replace(/\D+/g, '');
      if (phoneNorm) {
        const { data, error } = await this.supabase
          .from('lead_identifiers')
          .select('lead_id')
          .eq('type', 'phone')
          .eq('value_normalized', phoneNorm);

        if (error) throw error;
        const ids = (data ?? []).map((row) => row.lead_id);
        applyFilter(ids);
      } else {
        leadIds = [];
      }
    }

    return leadIds;
  }

  private async resolveTagIds(params: LeadsListingSearchDto): Promise<string[] | null> {
    if (!params.campaignTagKey && !params.tag && !params.tagId && !params.campaignName) return null;

    const tagIds = new Set<string>();

    if (params.tagId) {
      // Defesa extra: se chegar algo não-UUID (ex.: CPB8), ignoramos aqui para não estourar o banco.
      if (this.isUuid(params.tagId)) {
        tagIds.add(params.tagId);
      }
    }

    if (params.tag) {
      const tagKey = params.tag.trim();
      if (tagKey) {
        const { data, error } = await this.supabase.from('tags').select('id').eq('key', tagKey);
        if (error) throw error;
        for (const tag of data ?? []) {
          tagIds.add(tag.id);
        }
      }
    }

    if (params.campaignTagKey) {
      const { data, error } = await this.supabase
        .from('tags')
        .select('id')
        .eq('key', params.campaignTagKey);

      if (error) throw error;
      for (const tag of data ?? []) {
        tagIds.add(tag.id);
      }
    }

    if (params.campaignName) {
      const raw = params.campaignName.trim();
      if (raw) {
        const patternRaw = `%${this.escapeLikePattern(raw)}%`;
        const norm = normalizeText(raw);
        const patternNorm = norm ? `%${this.escapeLikePattern(norm)}%` : null;

        const tagMatches = new Set<string>();

        const { data: byName, error: byNameError } = await this.supabase
          .from('tags')
          .select('id')
          .ilike('name', patternRaw);
        if (byNameError) throw byNameError;
        for (const tag of byName ?? []) tagMatches.add(tag.id);

        const { data: byKey, error: byKeyError } = await this.supabase
          .from('tags')
          .select('id')
          .ilike('key', patternRaw);
        if (byKeyError) throw byKeyError;
        for (const tag of byKey ?? []) tagMatches.add(tag.id);

        const { data: byKeyNorm, error: byKeyNormError } = await this.supabase
          .from('tags')
          .select('id')
          .ilike('key_normalized', patternNorm ?? patternRaw);
        if (byKeyNormError) throw byKeyNormError;
        for (const tag of byKeyNorm ?? []) tagMatches.add(tag.id);

        for (const id of tagMatches) tagIds.add(id);
      }
    }

    if (tagIds.size === 0) return [];

    return [...tagIds];
  }

  private async resolveSalaryQuestionIds(params: LeadsListingSearchDto): Promise<string[] | null> {
    if (!this.needsSalaryFilter(params)) return null;

    const { data: questions, error: questionsError } = await this.supabase
      .from('form_questions')
      .select('id')
      .or(
        'key.eq.salary_range,key.eq.salaryRange,key.eq.faixa_salarial,' +
          'key.ilike.%renda%,' +
          'key.ilike.%salario%,' +
          'key.ilike.%remuneracao%,' +
          'label.ilike.%faixa salarial%,label.ilike.%salary%,label.ilike.%renda%,label.ilike.%salario%,label.ilike.%remuneracao%',
      );

    if (questionsError) throw questionsError;
    const questionIds = (questions ?? []).map((question) => question.id);
    if (questionIds.length === 0) return [];
    return questionIds;
  }

  private needsSalaryFilter(params: LeadsListingSearchDto): boolean {
    return this.buildSalaryTextPatterns(params).length > 0;
  }

  private buildSalaryTextPatterns(params: LeadsListingSearchDto): string[] {
    return [params.salaryRange, params.salaryMin, params.salaryMax]
      .map((value) => this.normalizeSalaryFilterInput(value))
      .filter((value): value is string => !!value)
      .map((value) => `%${this.escapeLikePattern(value)}%`);
  }

  private normalizeSalaryFilterInput(value?: string): string | null {
    if (!value) return null;
    return value
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/\s?R\$\s?/gi, 'R$')
      .replace(/,+/g, ',');
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  private escapeLikePattern(value: string): string {
    // Evita curingas involuntários em LIKE/ILIKE.
    return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  }

  private mapLeadListing(lead: LeadListingRow): LeadListingItem {
    const identifiers = lead.lead_identifiers ?? [];
    const email = this.pickIdentifierValue(identifiers, 'email');
    const phone = this.pickIdentifierValue(identifiers, 'phone');

    return {
      nome: lead.full_name,
      email,
      telefone: phone,
      ultimoContatoComercial: lead.last_activity_at,
    };
  }

  private pickIdentifierValue(
    identifiers: NonNullable<LeadListingRow['lead_identifiers']>,
    type: string,
  ): string | null {
    const filtered = identifiers.filter((identifier) => identifier.type === type);
    if (filtered.length === 0) return null;

    const primary = filtered.find((identifier) => identifier.is_primary);
    if (primary?.value) {
      return primary.value;
    }

    const sorted = [...filtered].sort((a, b) => {
      if (!a.created_at && !b.created_at) return 0;
      if (!a.created_at) return 1;
      if (!b.created_at) return -1;
      return a.created_at.localeCompare(b.created_at);
    });

    return sorted[0]?.value ?? null;
  }
}
