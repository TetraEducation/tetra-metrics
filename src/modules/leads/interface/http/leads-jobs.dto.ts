import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

const JOB_RUN_STATUSES = ['running', 'failed', 'completed'] as const;
type JobRunStatusValue = (typeof JOB_RUN_STATUSES)[number];

function toOptionalNumberOrOriginal(value: unknown): number | unknown | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'));
  if (!Number.isFinite(n)) return value;
  return n;
}

function toOptionalBooleanOrOriginal(value: unknown): boolean | unknown | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const v = String(value).trim().toLowerCase();
  if (v === 'true') return true;
  if (v === 'false') return false;
  return value;
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

export class RunNormalizeLeadSearchProfileDto {
  @IsOptional()
  @Transform(({ value }) => toOptionalBooleanOrOriginal(value))
  @IsBoolean()
  fromStart?: boolean;

  @IsOptional()
  @Transform(({ value }) => toOptionalBooleanOrOriginal(value))
  @IsBoolean()
  dryRun?: boolean;

  @IsOptional()
  @Transform(({ value }) => toOptionalNumberOrOriginal(value))
  @IsNumber()
  @Min(1)
  batchSize?: number;
}

