import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

const SEARCH_OPTIONS = ['email', 'phone', 'name'] as const;
export type SearchLeadV2Option = (typeof SEARCH_OPTIONS)[number];

export class SearchLeadV2Dto {
  @ApiPropertyOptional({
    enum: SEARCH_OPTIONS,
    description: 'Define qual identificador será usado na busca.',
    example: 'email',
  })
  @IsOptional()
  @IsIn(SEARCH_OPTIONS)
  option?: SearchLeadV2Option;

  @ApiPropertyOptional({ example: 'Maria Silva' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'lead@dominio.com' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ example: '5511999999999' })
  @IsOptional()
  @IsString()
  phone?: string;
}
