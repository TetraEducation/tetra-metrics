export interface LeadV2 {
  id: string;
  name: string | null;
  createdAt: string;
}

export type LeadIdentifierTypeV2 = 'email' | 'phone';
