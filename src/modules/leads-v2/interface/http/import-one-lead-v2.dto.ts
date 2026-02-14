import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsObject, IsString, ValidateIf } from 'class-validator';

export class ImportOneLeadV2Dto {
  @ApiPropertyOptional({ example: 'Maria Silva' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'lead@dominio.com' })
  @IsOptional()
  @IsString()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '5511999999999' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'landing-page' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ example: 'meta_ads' })
  @IsOptional()
  @IsString()
  sourceSystem?: string;

  @ApiPropertyOptional({
    example: 'contact_12345',
    description: 'Obrigatório quando sourceSystem for enviado.',
  })
  @ValidateIf((o: ImportOneLeadV2Dto) => Boolean(o.sourceSystem))
  @IsString()
  sourceRef?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: { campaign: 'oferta-fevereiro' },
  })
  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;

  @ApiPropertyOptional({
    example: 'nome_legado_campanha',
    description: 'Campo legado mantido por compatibilidade.',
  })
  @IsOptional()
  @IsString()
  utm_campaing?: string;

  // Campo correto (mantemos o legado `utm_campaing` por compatibilidade).
  @ApiPropertyOptional({ example: 'nome_campanha' })
  @IsOptional()
  @IsString()
  utm_campaign?: string;
}
