import { IsEmail, IsObject, IsOptional, IsString, ValidateIf } from 'class-validator';

export class ImportOneLeadDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  sourceSystem?: string;

  @ValidateIf((o: ImportOneLeadDto) => Boolean(o.sourceSystem))
  @IsString()
  sourceRef?: string;

  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  utm_campaing?: string;

  // Campo correto (mantemos o legado `utm_campaing` por compatibilidade).
  @IsOptional()
  @IsString()
  utm_campaign?: string;
}

