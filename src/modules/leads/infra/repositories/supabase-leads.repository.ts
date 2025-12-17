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
    const { error } = await this.supabase.from('leads').update({ name: payload.name ?? null }).eq('id', id);
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

  async findLeadBySearch(params: { name?: string; email?: string; phone?: string }): Promise<string | null> {
    // Busca por email (prioridade - chave de dedupe)
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

    // Busca por telefone
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

    // Busca por nome (busca parcial no full_name)
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
    // Buscar lead básico
    const { data: lead, error: leadError } = await this.supabase
      .from('leads')
      .select('id, full_name, first_contact_at, last_activity_at, created_at, updated_at')
      .eq('id', leadId)
      .single();

    if (leadError || !lead) {
      throw leadError ?? new Error('Lead not found');
    }

    // Buscar identifiers
    const { data: identifiers } = await this.supabase
      .from('lead_identifiers')
      .select('id, type, value, value_normalized, is_primary, created_at')
      .eq('lead_id', leadId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true });

    // Buscar sources
    const { data: sources } = await this.supabase
      .from('lead_sources')
      .select('id, source_system, source_ref, first_seen_at, last_seen_at, meta')
      .eq('lead_id', leadId)
      .order('first_seen_at', { ascending: true });

    // Buscar tags com join na tabela tags
    const { data: leadTags } = await this.supabase
      .from('lead_tags')
      .select('tag_id, source_system, source_ref, first_seen_at, last_seen_at, meta')
      .eq('lead_id', leadId)
      .order('first_seen_at', { ascending: true });

    // Buscar detalhes das tags
    const tagIds = leadTags?.map((lt) => lt.tag_id) ?? [];
    const { data: tags } =
      tagIds.length > 0
        ? await this.supabase
            .from('tags')
            .select('id, key, name, category')
            .in('id', tagIds)
        : { data: null };
    const tagsMap = new Map((tags ?? []).map((t) => [t.id, t]));

    // Buscar events
    const { data: events } = await this.supabase
      .from('lead_events')
      .select('id, event_type, source_system, occurred_at, ingested_at, dedupe_key, payload')
      .eq('lead_id', leadId)
      .order('occurred_at', { ascending: false });

    // Buscar funnel entries
    const { data: funnelEntries } = await this.supabase
      .from('lead_funnel_entries')
      .select('id, funnel_id, current_stage_id, status, source_system, external_ref, first_seen_at, last_seen_at, meta')
      .eq('lead_id', leadId)
      .order('first_seen_at', { ascending: true });

    // Buscar detalhes dos funnels
    const funnelIds = [...new Set((funnelEntries ?? []).map((fe) => fe.funnel_id))];
    const { data: funnels } =
      funnelIds.length > 0
        ? await this.supabase
            .from('funnels')
            .select('id, name')
            .in('id', funnelIds)
        : { data: null };
    const funnelsMap = new Map((funnels ?? []).map((f) => [f.id, f]));

    // Buscar detalhes dos stages
    const stageIds = (funnelEntries ?? [])
      .map((fe) => fe.current_stage_id)
      .filter((id): id is string => id !== null);
    const { data: stages } =
      stageIds.length > 0
        ? await this.supabase
            .from('funnel_stages')
            .select('id, name')
            .in('id', stageIds)
        : { data: null };
    const stagesMap = new Map((stages ?? []).map((s) => [s.id, s]));

    // Montar resposta
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















