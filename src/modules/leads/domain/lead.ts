export interface Lead {
  id: string;
  name: string | null;
  createdAt: string;
}

export type LeadIdentifierType = 'email' | 'phone';

export interface LeadIdentifier {
  id: string;
  leadId: string;
  type: LeadIdentifierType;
  valueNorm: string;
}












