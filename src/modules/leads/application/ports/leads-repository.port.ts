import type { Lead, LeadIdentifier, LeadIdentifierType } from '@/modules/leads/domain/lead';
import type {
  LeadListingItem,
  LeadsListingResult,
  LeadsListingSearchDto,
} from '@/modules/leads/application/dto/leads-listing.dto';

export const LEADS_REPOSITORY = Symbol('LEADS_REPOSITORY');

export type LeadIdentifierOnConflict = 'ignore' | 'set_primary';

export type AttachIdentifierInput = {
  type: LeadIdentifierType;
  value: string;
  valueNorm: string;
  isPrimary?: boolean;
  onConflict?: LeadIdentifierOnConflict;
};

export type AttachIdentifiersResult = {
  conflicts: Array<{ type: LeadIdentifierType; valueNorm: string }>;
};

export interface LeadsRepositoryPort {
  findIdentifiersByValues(values: string[]): Promise<LeadIdentifier[]>;
  createLead(payload: { name?: string | null }): Promise<Lead>;
  attachIdentifiers(leadId: string, identifiers: AttachIdentifierInput[]): Promise<AttachIdentifiersResult>;
  updateLead(id: string, payload: { name: string }): Promise<void>;
  upsertLeadSource(params: {
    leadId: string;
    sourceSystem: string;
    sourceRef: string;
    meta?: unknown;
  }): Promise<void>;
  upsertTag(params: {
    key: string;
    name: string;
    category?: string | null;
    weight?: number;
  }): Promise<string>;
  upsertTagAlias(params: { tagId: string; sourceSystem: string; sourceKey: string }): Promise<void>;
  upsertLeadTag(params: {
    leadId: string;
    tagId: string;
    sourceSystem: string;
    sourceRef?: string | null;
    meta?: unknown;
    lastSeenAt?: string;
  }): Promise<void>;
  createLeadEvent(params: {
    leadId: string;
    eventType: string;
    sourceSystem: string;
    occurredAt: string;
    ingestedAt: string;
    dedupeKey: string;
    payload?: unknown;
  }): Promise<void>;
  reassignIdentifiers(targetLeadId: string, sourceLeadIds: string[]): Promise<void>;
  deleteLeads(ids: string[]): Promise<void>;
  getLeadById(id: string): Promise<Lead>;
  findLeadBySearch(params: {
    name?: string;
    email?: string;
    phone?: string;
  }): Promise<string | null>;
  getLeadDetailById(leadId: string): Promise<unknown>;
  listLeads(params: LeadsListingSearchDto): Promise<LeadsListingResult<LeadListingItem>>;
  listLeadIds(params: LeadsListingSearchDto): Promise<string[]>;
}
