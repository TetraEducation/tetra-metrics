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
}

