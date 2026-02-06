-- Add trigram index to speed up ILIKE filters on form_answers.value_text
-- Used by leads listing salary text filters.

create extension if not exists pg_trgm;

create index if not exists idx_form_answers_value_text_trgm
  on public.form_answers
  using gin (value_text gin_trgm_ops)
  where value_text is not null;

