import type { LeadDetailDto } from '@/modules/leads/application/dto/lead-detail.dto';

export interface LeadDetailFormQuestionDto {
  answer_id: string;
  question_id: string;
  question_key: string | null;
  question_label: string | null;
  question_position: number | null;
  question_data_type: string | null;
  value_text: string | null;
  value_number: number | null;
  value_bool: boolean | null;
  value_json: unknown | null;
  created_at: string;
}

export interface LeadDetailFormDto {
  submission_id: string;
  form_schema_id: string;
  form_name: string | null;
  form_source_system: string | null;
  submitted_at: string | null;
  source_ref: string | null;
  dedupe_key: string | null;
  created_at: string;
  raw_payload: unknown;
  questions: LeadDetailFormQuestionDto[];
}

export interface LeadDetailResponseDto extends LeadDetailDto {
  forms: LeadDetailFormDto[];
}
