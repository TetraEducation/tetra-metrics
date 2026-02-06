import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export const LEADS_LISTING_SORT_FIELDS = ['last_activity_at', 'created_at', 'full_name'] as const;
export type LeadsListingSortField = (typeof LEADS_LISTING_SORT_FIELDS)[number];

export const LEADS_LISTING_SORT_DIRECTIONS = ['asc', 'desc'] as const;
export type LeadsListingSortDirection = (typeof LEADS_LISTING_SORT_DIRECTIONS)[number];

export const LEAD_GENDERS = ['male', 'female', 'non_binary', 'other', 'prefer_not_to_say'] as const;
export type LeadGender = (typeof LEAD_GENDERS)[number];

export const LEAD_COMPANY_SIZES = [
  'micro',
  'small',
  'medium',
  'large',
  'enterprise',
  'unemployed',
] as const;
export type LeadCompanySize = (typeof LEAD_COMPANY_SIZES)[number];

export const LEAD_EDUCATION_LEVELS = [
  'fundamental',
  'high_school',
  'high_school_incomplete',
  'technical',
  'bachelor',
  'bachelor_incomplete',
  'post_graduate',
  'master',
  'doctorate',
] as const;
export type LeadEducationLevel = (typeof LEAD_EDUCATION_LEVELS)[number];

function toOptionalNumberOrOriginal(value: unknown): number | unknown | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'));
  if (!Number.isFinite(n)) return value; // deixa a validação falhar
  return n;
}

function toOptionalPositiveNumberOrOriginal(value: unknown): number | unknown | undefined {
  const parsed = toOptionalNumberOrOriginal(value);
  if (typeof parsed !== 'number') return parsed;
  if (parsed <= 0) return undefined; // 0 (ou negativo) = não informado (apenas para filtros)
  return parsed;
}

function toOptionalBoolean(value: unknown): boolean | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  return undefined;
}

export class LeadsListingSearchDto {
  @IsOptional()
  @Transform(({ value }) => toOptionalNumberOrOriginal(value))
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => toOptionalNumberOrOriginal(value))
  @IsNumber()
  @Min(1)
  perPage?: number;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  campaignName?: string;

  @IsOptional()
  @IsString()
  campaignTagKey?: string;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsUUID()
  tagId?: string;

  @IsOptional()
  @Transform(({ value }) => toOptionalPositiveNumberOrOriginal(value))
  @IsNumber()
  salaryMin?: number;

  @IsOptional()
  @Transform(({ value }) => toOptionalPositiveNumberOrOriginal(value))
  @IsNumber()
  salaryMax?: number;

  @IsOptional()
  @Transform(({ value }) => toOptionalPositiveNumberOrOriginal(value))
  @IsNumber()
  ageMin?: number;

  @IsOptional()
  @Transform(({ value }) => toOptionalPositiveNumberOrOriginal(value))
  @IsNumber()
  ageMax?: number;

  @IsOptional()
  @IsIn(LEAD_GENDERS)
  gender?: LeadGender;

  @IsOptional()
  @IsIn(LEAD_COMPANY_SIZES)
  companySize?: LeadCompanySize;

  @IsOptional()
  @IsIn(LEAD_EDUCATION_LEVELS)
  educationLevel?: LeadEducationLevel;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  hasClintSource?: boolean;

  @IsOptional()
  @IsString()
  lastActivityFrom?: string;

  @IsOptional()
  @IsString()
  lastActivityTo?: string;

  @IsOptional()
  @IsIn(LEADS_LISTING_SORT_FIELDS)
  orderBy?: LeadsListingSortField;

  @IsOptional()
  @IsIn(LEADS_LISTING_SORT_DIRECTIONS)
  orderDirection?: LeadsListingSortDirection;
}

export type LeadListingItem = {
  nome: string | null;
  email: string | null;
  telefone: string | null;
  ultimoContatoComercial: string | null;
};

export type LeadsListingResult<T> = {
  data: T[];
  page: number;
  perPage: number;
  total: number;
};
