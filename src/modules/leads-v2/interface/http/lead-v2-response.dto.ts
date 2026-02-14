import { ApiProperty } from '@nestjs/swagger';

export class LeadIdentifierResponseDto {
  @ApiProperty({ example: 'idn_01HZX8M1M8D4Q5N9S1C2B3A4D5' })
  id!: string;

  @ApiProperty({ example: 'email' })
  type!: string;

  @ApiProperty({ example: 'lead@dominio.com' })
  value!: string;

  @ApiProperty({ example: 'lead@dominio.com' })
  value_normalized!: string;

  @ApiProperty({ example: true })
  is_primary!: boolean;

  @ApiProperty({ example: '2026-02-14T12:00:00.000Z' })
  created_at!: string;
}

export class LeadSourceResponseDto {
  @ApiProperty({ example: 'src_01HZX8M1M8D4Q5N9S1C2B3A4D5' })
  id!: string;

  @ApiProperty({ example: 'meta_ads' })
  source_system!: string;

  @ApiProperty({ example: 'contact_12345' })
  source_ref!: string;

  @ApiProperty({ example: '2026-02-14T12:00:00.000Z' })
  first_seen_at!: string;

  @ApiProperty({ example: '2026-02-14T12:20:00.000Z' })
  last_seen_at!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: { campaign: 'curso-node', adset: 'lookalike-1' },
  })
  meta!: unknown;
}

export class LeadTagResponseDto {
  @ApiProperty({ example: 'tag_01HZX8M1M8D4Q5N9S1C2B3A4D5' })
  tag_id!: string;

  @ApiProperty({ example: 'lead_temperature' })
  tag_key!: string;

  @ApiProperty({ example: 'Lead quente' })
  tag_name!: string;

  @ApiProperty({ nullable: true, example: 'qualificacao' })
  tag_category!: string | null;

  @ApiProperty({ example: 'crm' })
  source_system!: string;

  @ApiProperty({ nullable: true, example: 'deal_123' })
  source_ref!: string | null;

  @ApiProperty({ example: '2026-02-14T12:00:00.000Z' })
  first_seen_at!: string;

  @ApiProperty({ example: '2026-02-14T12:30:00.000Z' })
  last_seen_at!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: { origin: 'sync-crm' },
  })
  meta!: unknown;
}

export class LeadEventResponseDto {
  @ApiProperty({ example: 'evt_01HZX8M1M8D4Q5N9S1C2B3A4D5' })
  id!: string;

  @ApiProperty({ example: 'whatsapp_message_sent' })
  event_type!: string;

  @ApiProperty({ example: 'clint' })
  source_system!: string;

  @ApiProperty({ example: '2026-02-14T11:59:00.000Z' })
  occurred_at!: string;

  @ApiProperty({ example: '2026-02-14T12:00:00.000Z' })
  ingested_at!: string;

  @ApiProperty({ nullable: true, example: 'lead:123:message:456' })
  dedupe_key!: string | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: { channel: 'whatsapp', status: 'delivered' },
  })
  payload!: unknown;
}

export class LeadFunnelEntryResponseDto {
  @ApiProperty({ example: 'fen_01HZX8M1M8D4Q5N9S1C2B3A4D5' })
  id!: string;

  @ApiProperty({ example: 'fun_01HZX8M1M8D4Q5N9S1C2B3A4D5' })
  funnel_id!: string;

  @ApiProperty({ example: 'Funil Comercial' })
  funnel_name!: string;

  @ApiProperty({ nullable: true, example: 'stg_01HZX8M1M8D4Q5N9S1C2B3A4D5' })
  current_stage_id!: string | null;

  @ApiProperty({ nullable: true, example: 'Contato inicial' })
  current_stage_name!: string | null;

  @ApiProperty({ example: 'active' })
  status!: string;

  @ApiProperty({ example: 'crm' })
  source_system!: string;

  @ApiProperty({ example: 'deal_12345' })
  external_ref!: string;

  @ApiProperty({ example: '2026-02-14T12:00:00.000Z' })
  first_seen_at!: string;

  @ApiProperty({ example: '2026-02-14T12:30:00.000Z' })
  last_seen_at!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: { owner: 'time-vendas' },
  })
  meta!: unknown;
}

export class LeadSurveyAnswerResponseDto {
  @ApiProperty({ example: 'ans_01HZX8M1M8D4Q5N9S1C2B3A4D5' })
  answer_id!: string;

  @ApiProperty({ example: 'qst_01HZX8M1M8D4Q5N9S1C2B3A4D5' })
  question_id!: string;

  @ApiProperty({ nullable: true, example: 'faixa_renda' })
  question_key!: string | null;

  @ApiProperty({ nullable: true, example: 'Qual sua faixa de renda?' })
  question_label!: string | null;

  @ApiProperty({ nullable: true, example: 3 })
  question_position!: number | null;

  @ApiProperty({ nullable: true, example: 'number' })
  question_data_type!: string | null;

  @ApiProperty({ nullable: true, example: null })
  value_text!: string | null;

  @ApiProperty({ nullable: true, example: 12000 })
  value_number!: number | null;

  @ApiProperty({ nullable: true, example: null })
  value_bool!: boolean | null;

  @ApiProperty({
    nullable: true,
    type: 'object',
    additionalProperties: true,
    example: null,
  })
  value_json!: unknown | null;

  @ApiProperty({ example: '2026-02-14T12:00:00.000Z' })
  created_at!: string;
}

export class LeadSurveyResponseDto {
  @ApiProperty({ example: 'sub_01HZX8M1M8D4Q5N9S1C2B3A4D5' })
  submission_id!: string;

  @ApiProperty({ example: 'frm_01HZX8M1M8D4Q5N9S1C2B3A4D5' })
  form_schema_id!: string;

  @ApiProperty({ nullable: true, example: 'Formulário de Pré-Matrícula' })
  form_name!: string | null;

  @ApiProperty({ nullable: true, example: 'typeform' })
  form_source_system!: string | null;

  @ApiProperty({ nullable: true, example: '2026-02-14T11:50:00.000Z' })
  submitted_at!: string | null;

  @ApiProperty({ nullable: true, example: 'submission_7788' })
  source_ref!: string | null;

  @ApiProperty({ nullable: true, example: 'lead:123:form:frm_abc' })
  dedupe_key!: string | null;

  @ApiProperty({ example: '2026-02-14T12:00:00.000Z' })
  created_at!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: { utm_campaign: 'fevereiro_2026' },
  })
  raw_payload!: unknown;

  @ApiProperty({ type: () => [LeadSurveyAnswerResponseDto] })
  answers!: LeadSurveyAnswerResponseDto[];
}

export class LeadDetailResponseDto {
  @ApiProperty({ example: 'lead_01HZX8M1M8D4Q5N9S1C2B3A4D5' })
  id!: string;

  @ApiProperty({ nullable: true, example: 'Maria Silva' })
  full_name!: string | null;

  @ApiProperty({ nullable: true, example: '2026-01-10T08:00:00.000Z' })
  first_contact_at!: string | null;

  @ApiProperty({ nullable: true, example: '2026-02-14T12:30:00.000Z' })
  last_activity_at!: string | null;

  @ApiProperty({ example: '2026-01-10T08:00:00.000Z' })
  created_at!: string;

  @ApiProperty({ nullable: true, example: '2026-02-14T12:30:00.000Z' })
  updated_at!: string | null;

  @ApiProperty({ type: () => [LeadIdentifierResponseDto] })
  identifiers!: LeadIdentifierResponseDto[];

  @ApiProperty({ type: () => [LeadSourceResponseDto] })
  sources!: LeadSourceResponseDto[];

  @ApiProperty({ type: () => [LeadTagResponseDto] })
  tags!: LeadTagResponseDto[];

  @ApiProperty({ type: () => [LeadEventResponseDto] })
  events!: LeadEventResponseDto[];

  @ApiProperty({ type: () => [LeadFunnelEntryResponseDto] })
  funnel_entries!: LeadFunnelEntryResponseDto[];

  @ApiProperty({ type: () => [LeadSurveyResponseDto] })
  surveys!: LeadSurveyResponseDto[];
}

export class ImportOneLeadV2ResponseDto {
  @ApiProperty({ example: true })
  ok!: boolean;

  @ApiProperty({ example: 'lead_01HZX8M1M8D4Q5N9S1C2B3A4D5' })
  leadId!: string;

  @ApiProperty({ example: true })
  created!: boolean;

  @ApiProperty({ example: false })
  phoneIgnoredDueToConflict!: boolean;
}
