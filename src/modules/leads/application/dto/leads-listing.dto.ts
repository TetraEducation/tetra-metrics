import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export const LEADS_LISTING_SORT_FIELDS = ['last_activity_at', 'created_at', 'full_name'] as const;
export type LeadsListingSortField = (typeof LEADS_LISTING_SORT_FIELDS)[number];

export const LEADS_LISTING_SORT_DIRECTIONS = ['asc', 'desc'] as const;
export type LeadsListingSortDirection = (typeof LEADS_LISTING_SORT_DIRECTIONS)[number];

export class LeadsListingSearchDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
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
  @IsString()
  salaryRange?: string;

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
