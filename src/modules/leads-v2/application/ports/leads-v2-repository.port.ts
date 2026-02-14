import type { LeadIdentifierTypeV2, LeadV2 } from '@/modules/leads-v2/domain/lead-v2';

export const LEADS_V2_REPOSITORY = Symbol('LEADS_V2_REPOSITORY');

export type LeadIdentifierOnConflictV2 = 'ignore' | 'set_primary';

export type AttachIdentifierInputV2 = {
  type: LeadIdentifierTypeV2;
  value: string;
  valueNorm: string;
  isPrimary?: boolean;
  onConflict?: LeadIdentifierOnConflictV2;
};

export type AttachIdentifiersResultV2 = {
  conflicts: Array<{ type: LeadIdentifierTypeV2; valueNorm: string }>;
};

export interface LeadsV2RepositoryPort {
  findLeadBySearch(params: { email?: string; phone?: string }): Promise<string | null>;
  createLead(payload: { name?: string | null }): Promise<LeadV2>;
  attachIdentifiers(
    leadId: string,
    identifiers: AttachIdentifierInputV2[],
  ): Promise<AttachIdentifiersResultV2>;
  updateLead(id: string, payload: { name: string }): Promise<void>;
  deleteLeads(ids: string[]): Promise<void>;
  getLeadById(id: string): Promise<LeadV2>;
}
