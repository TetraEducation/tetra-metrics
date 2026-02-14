export const LeadIdentifierTypeOptions = {
  EMAIL: 'EMAIL',
  PHONE: 'PHONE',
} as const;

export type LeadIdentifierType = (typeof LeadIdentifierTypeOptions)[keyof typeof LeadIdentifierTypeOptions];
export type LeadIdentifierTypeKey = keyof typeof LeadIdentifierTypeOptions;
