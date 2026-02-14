import type { LeadIdentifierType as SharedLeadIdentifierType } from '@/shared/enums/lead-identifier-type.enum';

export interface LeadV2 {
  id: string;
  name: string | null;
  createdAt: string;
}

export type LeadIdentifierTypeV2 = SharedLeadIdentifierType;
