import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import type { JobRunStatusV2 } from '@/modules/leads-v2/application/ports/leads-v2-job-runs.port';
import { LeadsListingSearchDto } from '@/modules/leads/application/dto/leads-listing.dto';

const JOB_RUN_STATUSES = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED'] as const;

function toOptionalNumberOrOriginal(value: unknown): number | unknown | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'));
  if (!Number.isFinite(n)) return value;
  return n;
}

function toOptionalBooleanOrOriginal(value: unknown): boolean | unknown | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return value;
}

export class ListLeadsV2JobRunsQueryDto {
  @ApiPropertyOptional({
    enum: JOB_RUN_STATUSES,
    description: 'Filtra por status.',
  })
  @IsOptional()
  @IsEnum(JOB_RUN_STATUSES)
  status?: JobRunStatusV2;

  @ApiPropertyOptional({
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class ListLeadsV2ExportOperationsQueryDto {
  @ApiPropertyOptional({
    enum: JOB_RUN_STATUSES,
    description: 'Filtra por status da operação de exportação.',
  })
  @IsOptional()
  @IsEnum(JOB_RUN_STATUSES)
  status?: JobRunStatusV2;

  @ApiPropertyOptional({
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class SpreadsheetImportQueuedResponseDto {
  @ApiProperty({ example: true })
  ok!: boolean;

  @ApiProperty({
    example: [
      {
        fileName: 'leads_janeiro.xlsx',
        jobRunId: 'cmf1d1x1y0000abc123def456',
        status: 'PENDING',
      },
      {
        fileName: 'leads_fevereiro.xlsx',
        error: 'Este arquivo já foi registrado anteriormente para processamento.',
      },
    ],
  })
  jobs!: Array<{
    fileName: string;
    jobRunId?: string;
    status?: JobRunStatusV2;
    error?: string;
  }>;
}

export class LeadsV2ListQueryDto extends LeadsListingSearchDto {}

export class ExportLeadsV2Dto extends LeadsListingSearchDto {}

export class ExportLeadsV2QueuedResponseDto {
  @ApiProperty({ example: true })
  ok!: boolean;

  @ApiProperty({ example: 'cmf1d1x1y0000abc123def456' })
  operationId!: string;

  @ApiProperty({ example: '/v2/import-operations/cmf1d1x1y0000abc123def456' })
  statusUrl!: string;

  @ApiProperty({ example: 'PENDING', enum: JOB_RUN_STATUSES })
  status!: JobRunStatusV2;
}

export class RunNormalizeSearchProfileV2Dto {
  @ApiPropertyOptional({
    description: 'Reinicia leitura desde o inicio das respostas.',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => toOptionalBooleanOrOriginal(value))
  fromStart?: boolean;

  @ApiPropertyOptional({
    description: 'Simula sem gravar no lead_search_profile.',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => toOptionalBooleanOrOriginal(value))
  dryRun?: boolean;

  @ApiPropertyOptional({
    description: 'Tamanho do lote de respostas por iteracao.',
    default: 500,
    minimum: 1,
    maximum: 5000,
  })
  @IsOptional()
  @Transform(({ value }) => toOptionalNumberOrOriginal(value))
  @IsInt()
  @Min(1)
  @Max(5000)
  batchSize?: number;
}
