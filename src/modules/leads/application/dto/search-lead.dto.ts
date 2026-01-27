import { IsIn, IsOptional, IsString } from 'class-validator';

const SEARCH_OPTIONS = ['email', 'phone', 'name'] as const;
export type SearchLeadOption = (typeof SEARCH_OPTIONS)[number];

export class SearchLeadDto {
  @IsOptional()
  @IsIn(SEARCH_OPTIONS)
  option?: SearchLeadOption;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
