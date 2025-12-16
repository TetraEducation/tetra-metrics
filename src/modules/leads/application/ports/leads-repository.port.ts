import type { Lead, LeadIdentifier, LeadIdentifierType } from '@/modules/leads/domain/lead';

export const LEADS_REPOSITORY = Symbol('LEADS_REPOSITORY');

export interface LeadsRepositoryPort {
  findIdentifiersByValues(values: string[]): Promise<LeadIdentifier[]>;
  createLead(payload: { name?: string | null }): Promise<Lead>;
  attachIdentifiers(
    leadId: string,
    identifiers: Array<{ type: LeadIdentifierType; valueNorm: string }>,
  ): Promise<void>;
  updateLead(id: string, payload: { name?: string | null }): Promise<void>;
  reassignIdentifiers(targetLeadId: string, sourceLeadIds: string[]): Promise<void>;
  deleteLeads(ids: string[]): Promise<void>;
  getLeadById(id: string): Promise<Lead>;
}














