import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

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

export const LEAD_EXCEL_KNOWLEDGE_LEVELS = [
  'beginner',
  'basic',
  'intermediate',
  'advanced',
] as const;
export type LeadExcelKnowledgeLevel = (typeof LEAD_EXCEL_KNOWLEDGE_LEVELS)[number];
export const LEAD_POWER_BI_KNOWLEDGE_LEVELS = [
  'beginner',
  'basic',
  'intermediate',
  'advanced',
] as const;
export type LeadPowerBiKnowledgeLevel = (typeof LEAD_POWER_BI_KNOWLEDGE_LEVELS)[number];

export const LEAD_JOB_ROLES = [
  'manager',
  'director',
  'consultant',
  'entrepreneur',
  'coordinator',
  'analyst',
  'teacher',
  'controller',
  'supervisor',
] as const;
export type LeadJobRole = (typeof LEAD_JOB_ROLES)[number];

function normalizeMultiValueParam(value: unknown): string[] | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const entries = Array.isArray(value) ? value : [value];
  const values: string[] = [];
  for (const entry of entries) {
    if (entry === null || entry === undefined) continue;
    const text = String(entry);
    for (const chunk of text.split(',')) {
      const trimmed = chunk.trim();
      if (trimmed) values.push(trimmed);
    }
  }
  return values.length > 0 ? values : undefined;
}

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
  @ApiPropertyOptional({
    description: 'Página atual da listagem.',
    minimum: 1,
    example: 1,
  })
  @IsOptional()
  @Transform(({ value }) => toOptionalNumberOrOriginal(value))
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    description: 'Quantidade de itens por página.',
    minimum: 1,
    example: 20,
  })
  @IsOptional()
  @Transform(({ value }) => toOptionalNumberOrOriginal(value))
  @IsNumber()
  @Min(1)
  perPage?: number;

  @ApiPropertyOptional({
    description: 'Filtra por nome do lead.',
    example: 'Maria',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'Filtra por e-mail do lead.',
    example: 'maria@email.com',
  })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({
    description: 'Filtra por telefone do lead.',
    example: '+5511999990000',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    description: 'Filtra por nome da campanha associada.',
    example: 'CPB8',
  })
  @IsOptional()
  @IsString()
  campaignName?: string;

  @ApiPropertyOptional({
    description: 'Filtra pela chave da campanha associada.',
    example: 'CPB8',
  })
  @IsOptional()
  @IsString()
  campaignTagKey?: string;

  @ApiPropertyOptional({
    description: 'Filtra pela chave da tag associada.',
    example: 'IEA5',
  })
  @IsOptional()
  @IsString()
  tag?: string;

  @ApiPropertyOptional({
    description: 'Filtra pelo ID (UUID) da tag associada.',
    example: '8c5a4f0a-7c4b-4e0d-9a9b-1b1a2c3d4e5f',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  tagId?: string;

  @ApiPropertyOptional({
    description: 'Salário mínimo para filtro de faixa. Valor 0 é ignorado.',
    example: 1500,
  })
  @IsOptional()
  @Transform(({ value }) => toOptionalPositiveNumberOrOriginal(value))
  @IsNumber()
  salaryMin?: number;

  @ApiPropertyOptional({
    description: 'Salário máximo para filtro de faixa. Valor 0 é ignorado.',
    example: 10000,
  })
  @IsOptional()
  @Transform(({ value }) => toOptionalPositiveNumberOrOriginal(value))
  @IsNumber()
  salaryMax?: number;

  @ApiPropertyOptional({
    description: 'Idade mínima para filtro de faixa. Valor 0 é ignorado.',
    example: 18,
  })
  @IsOptional()
  @Transform(({ value }) => toOptionalPositiveNumberOrOriginal(value))
  @IsNumber()
  ageMin?: number;

  @ApiPropertyOptional({
    description: 'Idade máxima para filtro de faixa. Valor 0 é ignorado.',
    example: 60,
  })
  @IsOptional()
  @Transform(({ value }) => toOptionalPositiveNumberOrOriginal(value))
  @IsNumber()
  ageMax?: number;

  @ApiPropertyOptional({
    description: 'Gênero do lead.',
    enum: LEAD_GENDERS,
    example: 'female',
  })
  @IsOptional()
  @IsIn(LEAD_GENDERS, { each: true })
  @Transform(({ value }) => normalizeMultiValueParam(value))
  gender?: LeadGender[];

  @ApiPropertyOptional({
    description: 'Porte da empresa atual do lead.',
    enum: LEAD_COMPANY_SIZES,
    example: 'medium',
  })
  @IsOptional()
  @IsIn(LEAD_COMPANY_SIZES, { each: true })
  @Transform(({ value }) => normalizeMultiValueParam(value))
  companySize?: LeadCompanySize[];

  @ApiPropertyOptional({
    description: 'Nível de escolaridade.',
    enum: LEAD_EDUCATION_LEVELS,
    example: 'bachelor',
  })
  @IsOptional()
  @IsIn(LEAD_EDUCATION_LEVELS, { each: true })
  @Transform(({ value }) => normalizeMultiValueParam(value))
  educationLevel?: LeadEducationLevel[];

  @ApiPropertyOptional({
    description: 'Nível de conhecimento em Excel.',
    enum: LEAD_EXCEL_KNOWLEDGE_LEVELS,
    example: 'intermediate',
  })
  @IsOptional()
  @IsIn(LEAD_EXCEL_KNOWLEDGE_LEVELS, { each: true })
  @Transform(({ value }) => normalizeMultiValueParam(value))
  excelKnowledge?: LeadExcelKnowledgeLevel[];

  @ApiPropertyOptional({
    description: 'Nível de conhecimento em Power BI.',
    enum: LEAD_POWER_BI_KNOWLEDGE_LEVELS,
    example: 'intermediate',
  })
  @IsOptional()
  @IsIn(LEAD_POWER_BI_KNOWLEDGE_LEVELS, { each: true })
  @Transform(({ value }) => normalizeMultiValueParam(value))
  powerBiKnowledge?: LeadPowerBiKnowledgeLevel[];

  @ApiPropertyOptional({
    description: 'Cargo/função principal do lead.',
    enum: LEAD_JOB_ROLES,
    example: 'analyst',
  })
  @IsOptional()
  @IsIn(LEAD_JOB_ROLES, { each: true })
  @Transform(({ value }) => normalizeMultiValueParam(value))
  jobRole?: LeadJobRole[];

  @ApiPropertyOptional({
    description: 'Nome da empresa atual do lead.',
    example: 'Tetra Educação',
  })
  @IsOptional()
  @IsString()
  currentCompany?: string;

  @ApiPropertyOptional({
    description:
      "Filtra leads com origem Clint. Use true para incluir apenas leads com source_system='clint'; false para os demais.",
    type: Boolean,
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  hasClintSource?: boolean;

  @ApiPropertyOptional({
    description: 'Data/hora inicial para filtro de última atividade (ISO 8601).',
    example: '2026-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsString()
  lastActivityFrom?: string;

  @ApiPropertyOptional({
    description: 'Data/hora final para filtro de última atividade (ISO 8601).',
    example: '2026-01-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsString()
  lastActivityTo?: string;

  @ApiPropertyOptional({
    description: 'Campo utilizado para ordenação.',
    enum: LEADS_LISTING_SORT_FIELDS,
    example: 'last_activity_at',
  })
  @IsOptional()
  @IsIn(LEADS_LISTING_SORT_FIELDS)
  orderBy?: LeadsListingSortField;

  @ApiPropertyOptional({
    description: 'Direção da ordenação.',
    enum: LEADS_LISTING_SORT_DIRECTIONS,
    example: 'desc',
  })
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
