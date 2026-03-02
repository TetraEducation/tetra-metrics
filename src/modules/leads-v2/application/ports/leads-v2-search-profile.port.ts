export const LEADS_V2_SEARCH_PROFILE_REPOSITORY = Symbol('LEADS_V2_SEARCH_PROFILE_REPOSITORY');

export type LeadSearchProfileV2 = {
  leadId: string;
  salaryMin: number | null;
  salaryMax: number | null;
  ageMin: number | null;
  ageMax: number | null;
  gender: string | null;
  companySize: string | null;
  educationLevel: string | null;
  excelKnowledge: string | null;
  powerBiKnowledge: string | null;
  jobRole: string | null;
  seniorityLevel: string | null;
  currentCompany: string | null;
  updatedAt: string;
};

export type LeadSearchProfileFiltersV2 = {
  salaryMin?: number;
  salaryMax?: number;
  ageMin?: number;
  ageMax?: number;
  gender?: string;
  companySize?: string;
  educationLevel?: string;
  powerBiKnowledge?: string;
};

export type LeadSearchProfileUpsertInputV2 = {
  leadId: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  ageMin?: number | null;
  ageMax?: number | null;
  gender?: string | null;
  companySize?: string | null;
  educationLevel?: string | null;
  excelKnowledge?: string | null;
  powerBiKnowledge?: string | null;
  jobRole?: string | null;
  seniorityLevel?: string | null;
  currentCompany?: string | null;
};

export interface LeadsV2SearchProfileRepositoryPort {
  upsertBatch(batch: LeadSearchProfileUpsertInputV2[]): Promise<void>;
  findByLeadId(leadId: string): Promise<LeadSearchProfileV2 | null>;
  findLeadIdsByFilters(filters: LeadSearchProfileFiltersV2): Promise<string[]>;
}
