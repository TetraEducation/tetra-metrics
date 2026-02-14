import { IsIn, IsOptional, IsString } from 'class-validator';

const SEARCH_OPTIONS = ['email', 'phone', 'name'] as const;
export type SearchLeadV2Option = (typeof SEARCH_OPTIONS)[number];

export class SearchLeadV2Dto {
  @IsOptional()
  @IsIn(SEARCH_OPTIONS)
  option?: SearchLeadV2Option;

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
