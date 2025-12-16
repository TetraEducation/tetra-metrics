import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';

import { SUPABASE } from '@/infra/supabase/supabase.provider';
import type { LeadsRepositoryPort } from '@/modules/leads/application/ports/leads-repository.port';
import type { Lead, LeadIdentifier } from '@/modules/leads/domain/lead';

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














