import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const IMPORT_OPERATION_STATUSES = [
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'CANCELED',
] as const;

export type ImportOperationStatus = (typeof IMPORT_OPERATION_STATUSES)[number];

export class ImportOperationCountDto {
  @ApiProperty({ example: 100 })
  processed!: number;

  @ApiProperty({ example: 80 })
  created!: number;

  @ApiProperty({ example: 0 })
  updated!: number;

  @ApiProperty({ example: 10 })
  skipped!: number;

  @ApiProperty({ example: 10 })
  failed!: number;
}

export class ImportOperationErrorDto {
  @ApiProperty({ example: 15 })
  row!: number;

  @ApiProperty({ example: 'Email ausente ou invalido.' })
  reason!: string;

  @ApiPropertyOptional({ example: 'Pergunta 1', nullable: true })
  column?: string;

  @ApiPropertyOptional({ example: '9.999999999999E+30', nullable: true })
  value?: string;

  @ApiPropertyOptional({ example: 'P2020', nullable: true })
  code?: string;

  @ApiPropertyOptional({ example: 'cmllw3yah0000gji0vp5pbvxh', nullable: true })
  questionId?: string;
}

export class ImportOperationResponseDto {
  @ApiProperty({ example: 'cmf1d1x1y0000abc123def456' })
  id!: string;

  @ApiProperty({ example: 'RUNNING', enum: IMPORT_OPERATION_STATUSES })
  status!: ImportOperationStatus;

  @ApiProperty({ example: 55 })
  progressPercent!: number;

  @ApiPropertyOptional({
    example: null,
    nullable: true,
    description: 'ETA em segundos (heuristica). Quando indisponivel, retorna null.',
  })
  etaSeconds!: number | null;

  @ApiProperty({ type: ImportOperationCountDto })
  counts!: ImportOperationCountDto;

  @ApiProperty({
    type: ImportOperationErrorDto,
    isArray: true,
  })
  errors!: ImportOperationErrorDto[];

  @ApiProperty({ example: '2026-02-14T12:00:00.000Z' })
  createdAt!: string;

  @ApiPropertyOptional({ example: '2026-02-14T12:00:10.000Z', nullable: true })
  startedAt!: string | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  finishedAt!: string | null;

  @ApiPropertyOptional({
    example: null,
    nullable: true,
    description: 'Correlation id para rastreabilidade, quando disponivel.',
  })
  correlationId!: string | null;

  @ApiPropertyOptional({
    example: '/v2/leads/exports/cmf1d1x1y0000abc123def456/download',
    nullable: true,
    description: 'URL temporaria para download do CSV quando a operacao for export.',
  })
  downloadUrl?: string | null;

  @ApiPropertyOptional({
    example: '2026-02-18T10:01:00.000Z',
    nullable: true,
    description: 'Data de expiração do arquivo exportado.',
  })
  expiresAt?: string | null;
}
