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

export type LeadSourceSystemV2 = 'CLINT' | 'SPREADSHEET' | 'ACTIVECAMPAIGN' | 'FORM';
export type LeadEventTypeV2 = 'TAG_ADDED' | 'LEAD_IMPORTED';

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
  upsertLeadSource(params: {
    leadId: string;
    sourceSystem: LeadSourceSystemV2;
    sourceRef: string;
    meta?: Record<string, unknown>;
    lastSeenAt?: string;
  }): Promise<void>;
  upsertTag(params: {
    key: string;
    keyNormalized: string;
    name: string;
    category?: string | null;
    weight?: number;
  }): Promise<string>;
  upsertTagAlias(params: {
    tagId: string;
    sourceSystem: LeadSourceSystemV2;
    sourceKey: string;
  }): Promise<void>;
  upsertLeadTag(params: {
    leadId: string;
    tagId: string;
    sourceSystem: LeadSourceSystemV2;
    sourceRef?: string | null;
    meta?: Record<string, unknown> | null;
    lastSeenAt?: string;
  }): Promise<void>;
  createLeadEvent(params: {
    leadId: string;
    eventType: LeadEventTypeV2;
    sourceSystem: LeadSourceSystemV2;
    occurredAt: string;
    ingestedAt: string;
    dedupeKey: string;
    payload?: Record<string, unknown> | null;
  }): Promise<void>;
}
