import { IsEmail, IsOptional, IsString } from 'class-validator';

export class ImportOneLeadV2Dto {
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
}
