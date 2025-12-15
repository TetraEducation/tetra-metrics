import type { LEADS_SOURCE } from '@/modules/leads/domain/leads-source.enum';

export interface ImportLeadInput {
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  source?: LEADS_SOURCE | string | null;
}




