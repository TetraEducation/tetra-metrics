export interface LeadDetailDto {
  id: string;
  full_name: string | null;
  first_contact_at: string | null;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string | null;
  identifiers: Array<{
    id: string;
    type: string;
    value: string;
    value_normalized: string;
    is_primary: boolean;
    created_at: string;
  }>;
  sources: Array<{
    id: string;
    source_system: string;
    source_ref: string;
    first_seen_at: string;
    last_seen_at: string;
    meta: unknown;
  }>;
  tags: Array<{
    tag_id: string;
    tag_key: string;
    tag_name: string;
    tag_category: string | null;
    source_system: string;
    source_ref: string | null;
    first_seen_at: string;
    last_seen_at: string;
    meta: unknown;
  }>;
  events: Array<{
    id: string;
    event_type: string;
    source_system: string;
    occurred_at: string;
    ingested_at: string;
    dedupe_key: string | null;
    payload: unknown;
  }>;
  funnel_entries: Array<{
    id: string;
    funnel_id: string;
    funnel_name: string;
    current_stage_id: string | null;
    current_stage_name: string | null;
    status: string;
    source_system: string;
    external_ref: string;
    first_seen_at: string;
    last_seen_at: string;
    meta: unknown;
  }>;
  surveys: Array<{
    submission_id: string;
    form_schema_id: string;
    form_name: string | null;
    form_source_system: string | null;
    submitted_at: string | null;
    source_ref: string | null;
    dedupe_key: string | null;
    created_at: string;
    raw_payload: unknown;
    answers: Array<{
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
    }>;
  }>;
}


