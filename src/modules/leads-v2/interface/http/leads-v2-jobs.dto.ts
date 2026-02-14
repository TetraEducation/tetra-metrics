import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import type { JobRunStatusV2 } from '@/modules/leads-v2/application/ports/leads-v2-job-runs.port';

const JOB_RUN_STATUSES = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED'] as const;

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

export class SpreadsheetImportQueuedResponseDto {
  @ApiProperty({ example: true })
  ok!: boolean;

  @ApiProperty({ example: 'cmf1d1x1y0000abc123def456' })
  jobRunId!: string;

  @ApiProperty({ example: 'PENDING', enum: JOB_RUN_STATUSES })
  status!: JobRunStatusV2;
}
