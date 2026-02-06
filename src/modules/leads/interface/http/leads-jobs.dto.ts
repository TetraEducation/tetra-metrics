import { Transform } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

const JOB_RUN_STATUSES = ['running', 'failed', 'completed'] as const;
type JobRunStatusValue = (typeof JOB_RUN_STATUSES)[number];

function toOptionalNumberOrOriginal(value: unknown): number | unknown | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'));
  if (!Number.isFinite(n)) return value;
  return n;
}

export class LeadsJobRunsQueryDto {
  @IsOptional()
  @IsString()
  jobName?: string;

  @IsOptional()
  @IsIn(JOB_RUN_STATUSES)
  status?: JobRunStatusValue;

  @IsOptional()
  @Transform(({ value }) => toOptionalNumberOrOriginal(value))
  @IsNumber()
  @Min(1)
  limit?: number;
}

