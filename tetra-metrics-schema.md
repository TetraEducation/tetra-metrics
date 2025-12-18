# tetra-metrics — Schema do Banco (Supabase/Postgres)

Este documento descreve o schema **CANONICAL** do `tetra-metrics`, com **tabelas, atributos, regras de unicidade e contratos operacionais** (dedupe, idempotência, RPCs).
Use como **SSOT** no código para evitar drift de nomes/colunas.

> Regra de ouro do domínio  
> **Tag ≠ Funil/Origem**.  
> - **Tags**: rótulos N:N (ex.: `CPB13`, `VIP`, `BlackFriday`).  
> - **Funil/Origem (Clint)**: pipeline/kanban com etapas e status, modelado por `lead_funnel_entries`.

---

## Convenções gerais

- **PK**: UUID (`gen_random_uuid()`).
- **Timestamps**: `created_at` e `updated_at` quando fizer sentido.
- **Normalização**:
  - `*_normalized` = `lower(btrim(...))` e usado em `UNIQUE`.
- **Idempotência de ingestão/importação**:
  - `lead_sources (source_system, source_ref)`
  - `lead_events (source_system, dedupe_key)` quando `dedupe_key` existe (índice parcial)
  - `lead_funnel_entries (source_system, external_ref)`
  - `tags (key_normalized)`
  - `tag_aliases (source_system, source_key)`
  - **NOVO (pesquisas)**: `form_schemas (source_system, source_ref)` e `form_submissions (form_schema_id, dedupe_key)` quando `dedupe_key` existe
- `meta`/`payload` (`jsonb`) para carregar dados do fornecedor sem quebrar o schema.

---

## Regras de Deduplicação (Contrato Operacional)

**No estado atual do projeto:**
- **Email é a única chave de dedupe**.
- O lead é resolvido por:
  - `lead_identifiers.type = 'email'`
  - `lead_identifiers.value_normalized = lower(trim(email))`
- **Linhas sem e-mail válido devem ser ignoradas** no import (não criar lead “órfão”).
- Telefone, nome e documento são **enriquecimento** (não entram na lógica de dedupe por enquanto).

### Índice recomendado (consistência)
Garantir que cada lead tenha no máximo **1 e-mail primário**:

```sql
create unique index if not exists uq_lead_primary_email
on public.lead_identifiers (lead_id)
where type = 'email' and is_primary = true;
```

---

## Funções & Triggers

### `set_updated_at()` (função)
Atualiza automaticamente a coluna `updated_at` em `UPDATE`.

**Tabelas com trigger**
- `leads`
- `tags`
- `funnels`
- **NOVO**: `form_schemas`, `form_questions`, `form_submissions`

---

# Tabelas do Domínio

## 1) `leads`
**Finalidade:** Entidade central. Representa uma pessoa/contato unificado.

| Coluna | Tipo | Obrigatório | Observações |
|---|---:|:---:|---|
| `id` | uuid | ✅ | PK |
| `full_name` | text | ✅ | Nome completo “como veio” |
| `first_name` | text | ❌ | Opcional (derivado) |
| `last_name` | text | ❌ | Opcional (derivado) |
| `document` | text | ❌ | CPF/CNPJ etc. |
| `first_contact_at` | timestamptz | ❌ | Primeiro contato conhecido |
| `last_activity_at` | timestamptz | ❌ | Última atividade/evento |
| `created_at` | timestamptz | ✅ | default `now()` |
| `updated_at` | timestamptz | ✅ | trigger |

**Índices**
- `idx_leads_last_activity_at (last_activity_at desc)`
- `idx_leads_full_name_trgm` (GIN trigram)

**Relacionamentos**
- 1:N com `lead_identifiers`, `lead_sources`, `lead_events`, `lead_funnel_entries`
- N:N com `tags` via `lead_tags`
- 1:1 com `lead_stats`
- **NOVO**: 1:N com `form_submissions` (via `lead_id`)

---

## 2) `lead_identifiers`
**Finalidade:** Identificadores deduplicáveis (email, phone, document…).

| Coluna | Tipo | Obrigatório | Observações |
|---|---:|:---:|---|
| `id` | uuid | ✅ | PK |
| `lead_id` | uuid | ✅ | FK → `leads.id` (cascade) |
| `type` | text | ✅ | `email`, `phone`, `document` |
| `value` | text | ✅ | Valor original |
| `value_normalized` | text | ✅ | Valor normalizado |
| `is_primary` | boolean | ✅ | default `false` |
| `created_at` | timestamptz | ✅ | default `now()` |

**Unicidade**
- `UNIQUE (type, value_normalized)` → um identificador não pertence a dois leads.

---

## 3) `lead_sources`
**Finalidade:** Rastreio de referências externas (observabilidade).

| Coluna | Tipo | Obrigatório | Observações |
|---|---:|:---:|---|
| `id` | uuid | ✅ | PK |
| `lead_id` | uuid | ✅ | FK → `leads.id` (cascade) |
| `source_system` | text | ✅ | `clint`, `activecampaign`, `spreadsheet` |
| `source_ref` | text | ✅ | Ref externa |
| `first_seen_at` | timestamptz | ✅ | default `now()` |
| `last_seen_at` | timestamptz | ✅ | default `now()` |
| `meta` | jsonb | ✅ | default `{}` |

**Unicidade**
- `UNIQUE (source_system, source_ref)`

---

## 4) `lead_events`
**Finalidade:** Timeline append-only.

| Coluna | Tipo | Obrigatório | Observações |
|---|---:|:---:|---|
| `id` | uuid | ✅ | PK |
| `lead_id` | uuid | ✅ | FK → `leads.id` (cascade) |
| `event_type` | text | ✅ | `tag.added`, `deal.stage.changed` |
| `source_system` | text | ✅ | `clint`, `spreadsheet` etc. |
| `occurred_at` | timestamptz | ✅ | Quando ocorreu na origem |
| `ingested_at` | timestamptz | ✅ | Quando entrou aqui |
| `dedupe_key` | text | ❌ | Habilita idempotência |
| `payload` | jsonb | ✅ | default `{}` |

**Unicidade (parcial)**
- `UNIQUE (source_system, dedupe_key)` quando `dedupe_key` não é nulo/vazio.

---

# Tags (Catálogo + Aliases + Associação)

## 5) `tags`
**Finalidade:** Catálogo canônico.

| Coluna | Tipo | Obrigatório | Observações |
|---|---:|:---:|---|
| `id` | uuid | ✅ | PK |
| `key` | text | ✅ | Ex.: `CPB13` |
| `key_normalized` | text | ✅ | generated |
| `name` | text | ✅ | Nome humano |
| `category` | text | ❌ | `campaign`, `segment`… |
| `weight` | int | ✅ | default `1` |
| `created_at` | timestamptz | ✅ | default `now()` |
| `updated_at` | timestamptz | ✅ | trigger |

**Unicidade**
- `UNIQUE (key_normalized)`

---

## 6) `tag_aliases`
**Finalidade:** Mapeia tag do sistema origem → tag canônica.

| Coluna | Tipo | Obrigatório |
|---|---:|:---:|
| `id` | uuid | ✅ |
| `tag_id` | uuid | ✅ |
| `source_system` | text | ✅ |
| `source_key` | text | ✅ |

**Unicidade**
- `UNIQUE (source_system, source_key)`

---

## 7) `lead_tags`
**Finalidade:** Associação N:N lead↔tag com rastreio.

| Coluna | Tipo | Obrigatório |
|---|---:|:---:|
| `lead_id` | uuid | ✅ |
| `tag_id` | uuid | ✅ |
| `source_system` | text | ✅ |
| `source_ref` | text | ❌ |
| `first_seen_at` | timestamptz | ✅ |
| `last_seen_at` | timestamptz | ✅ |
| `meta` | jsonb | ✅ |

**PK composta**
- `PRIMARY KEY (lead_id, tag_id, source_system)`

---

# Funis / “Origens” (Clint) e Etapas

## 8) `funnels`
**Finalidade:** Catálogo canônico de funis/pipelines.

| Coluna | Tipo | Obrigatório |
|---|---:|:---:|
| `id` | uuid | ✅ |
| `key` | text | ✅ |
| `key_normalized` | text | ✅ |
| `name` | text | ✅ |
| `created_at` | timestamptz | ✅ |
| `updated_at` | timestamptz | ✅ |

**Unicidade**
- `UNIQUE (key_normalized)`

---

## 9) `funnel_aliases`
**Finalidade:** Funil no sistema origem → funil canônico.

| Coluna | Tipo | Obrigatório |
|---|---:|:---:|
| `id` | uuid | ✅ |
| `funnel_id` | uuid | ✅ |
| `source_system` | text | ✅ |
| `source_key` | text | ✅ |

**Unicidade**
- `UNIQUE (source_system, source_key)`

---

## 10) `funnel_stages`
**Finalidade:** Etapas/colunas do funil (kanban).

| Coluna | Tipo | Obrigatório |
|---|---:|:---:|
| `id` | uuid | ✅ |
| `funnel_id` | uuid | ✅ |
| `key` | text | ✅ |
| `key_normalized` | text | ✅ |
| `name` | text | ✅ |
| `position` | int | ✅ |
| `created_at` | timestamptz | ✅ |

**Unicidade**
- `UNIQUE (funnel_id, key_normalized)`

---

## 11) `lead_funnel_entries`
**Finalidade:** Instância do lead dentro de um funil (o “card/deal”), com etapa atual e status.

> **Sim**: o objetivo da tela de entries é exatamente enxergar **em quais funis (origens/pipelines)** o lead está e **qual stage/status** ele está em cada um.

| Coluna | Tipo | Obrigatório |
|---|---:|:---:|
| `id` | uuid | ✅ |
| `lead_id` | uuid | ✅ |
| `funnel_id` | uuid | ✅ |
| `current_stage_id` | uuid | ❌ |
| `status` | text | ✅ | `open` \| `won` \| `lost` |
| `source_system` | text | ✅ |
| `external_ref` | text | ✅ | Ex.: `deal:<id>` |
| `first_seen_at` | timestamptz | ✅ |
| `last_seen_at` | timestamptz | ✅ |
| `meta` | jsonb | ✅ |

**Unicidade**
- `UNIQUE (source_system, external_ref)`

---

# Cache / Projeções

## 12) `lead_stats`
**Finalidade:** Snapshot (camada de leitura) para consultas rápidas.

| Coluna | Tipo | Obrigatório |
|---|---:|:---:|
| `lead_id` | uuid | ✅ |
| `first_contact_at` | timestamptz | ❌ |
| `last_activity_at` | timestamptz | ❌ |
| `distinct_tag_count` | int | ✅ |
| `event_count` | int | ✅ |
| `source_count` | int | ✅ |
| `qualification_score` | int | ✅ |
| `qualification_reasons` | jsonb | ✅ |
| `updated_at` | timestamptz | ✅ |

---

# NOVO: Pesquisas / Planilhas com Perguntas Dinâmicas (Forms)

Objetivo: suportar planilhas tipo “Google Forms / pesquisas”, onde você **não sabe previamente** quais perguntas existem.
A ingestão detecta `email/nome/telefone` para criar/enriquecer o lead, e o resto vira **perguntas + respostas** versionáveis.

## 13) `form_schemas`
**Finalidade:** “Template” de um formulário/planilha (uma aba, um CSV, uma origem de pesquisa).

| Coluna | Tipo | Obrigatório | Observações |
|---|---:|:---:|---|
| `id` | uuid | ✅ | PK |
| `source_system` | text | ✅ | `sheets`, `csv`, `spreadsheet` |
| `source_ref` | text | ✅ | Ex.: `spreadsheetId:tabName` |
| `name` | text | ✅ | Ex.: `IEA1` |
| `name_normalized` | text | ✅ | generated |
| `tag_id` | uuid | ❌ | FK → `tags.id` (opcional: tag da campanha/planilha) |
| `meta` | jsonb | ✅ | `{}` |
| `created_at` | timestamptz | ✅ | now() |
| `updated_at` | timestamptz | ✅ | trigger |

**Unicidade**
- `UNIQUE (source_system, source_ref)`

---

## 14) `form_questions`
**Finalidade:** Perguntas (geralmente colunas) dentro de um `form_schema`.

| Coluna | Tipo | Obrigatório |
|---|---:|:---:|
| `id` | uuid | ✅ |
| `form_schema_id` | uuid | ✅ |
| `key` | text | ✅ | slug gerado do header |
| `key_normalized` | text | ✅ | generated |
| `label` | text | ✅ | header original |
| `position` | int | ✅ |
| `data_type` | text | ✅ | `text|number|bool|date|select|unknown` |
| `meta` | jsonb | ✅ |
| `created_at` | timestamptz | ✅ |
| `updated_at` | timestamptz | ✅ |

**Unicidade**
- `UNIQUE (form_schema_id, key_normalized)`

---

## 15) `form_submissions`
**Finalidade:** Uma submissão/linha importada (1 row ⇒ 1 submission).

| Coluna | Tipo | Obrigatório | Observações |
|---|---:|:---:|---|
| `id` | uuid | ✅ | PK |
| `form_schema_id` | uuid | ✅ | FK |
| `lead_id` | uuid | ❌ | FK → `leads.id` |
| `submitted_at` | timestamptz | ❌ | timestamp do forms/planilha |
| `source_ref` | text | ❌ | ex.: `row:123` |
| `dedupe_key` | text | ❌ | idempotência (ex.: `filehash:rowNumber`) |
| `raw_payload` | jsonb | ✅ | linha inteira (auditoria) |
| `created_at` | timestamptz | ✅ |
| `updated_at` | timestamptz | ✅ |

**Unicidade (parcial)**
- `UNIQUE (form_schema_id, dedupe_key)` quando `dedupe_key` existe

---

## 16) `form_answers`
**Finalidade:** Respostas por pergunta (1 cell ⇒ 1 answer).

| Coluna | Tipo | Obrigatório |
|---|---:|:---:|
| `id` | uuid | ✅ |
| `form_submission_id` | uuid | ✅ |
| `question_id` | uuid | ✅ |
| `value_text` | text | ❌ |
| `value_number` | numeric | ❌ |
| `value_bool` | boolean | ❌ |
| `value_json` | jsonb | ❌ |
| `created_at` | timestamptz | ✅ |

**Unicidade**
- `UNIQUE (form_submission_id, question_id)`

---

# RPCs do Banco (Contrato de Ingestão)

## `public.ingest_spreadsheet_row(...)`
**Finalidade:** Ingestão idempotente de linha “simples” (campanha/tag + lead).  
(sem perguntas dinâmicas)

> Mantém como está — bom para planilhas “de leads” sem pesquisa.

---

## NOVO: `public.ingest_form_submission(...)`
**Finalidade:** Ingestão **idempotente** de uma linha de pesquisa (form), criando:
- Lead (email-only dedupe)
- Schema do form
- Perguntas detectadas (headers)
- Submission (row)
- Answers (cells)
- (Opcional) Tag da campanha/planilha via `form_schemas.tag_id`

### Parâmetros (sugestão)
- `p_form_source_system text`
- `p_form_source_ref text`
- `p_form_name text`
- `p_dedupe_key text`
- `p_submitted_at timestamptz`
- `p_email_raw text`
- `p_full_name text`
- `p_phone text`
- `p_tag_key text`
- `p_row jsonb`
- `p_answers jsonb`

### Retorno (sugestão)
`jsonb`:
- `{"status":"ok","lead_id":"...","form_schema_id":"...","submission_id":"..."}`
- `{"status":"ignored","reason":"missing_email"}`

---

# Checklist de importação (MVP: email-only)

## A) Planilha “leads” (sem perguntas dinâmicas)
1) Detectar email (obrigatório)  
2) Para cada linha: `ingest_spreadsheet_row(...)` com:
   - `p_tag_key = nome do arquivo/campanha (ex.: CPB13)`
   - `p_source_ref = filehash:rowNumber`

## B) Planilha “pesquisa” (dinâmica)
1) Detectar email (obrigatório no MVP) + best-effort de `name/phone`
2) Derivar `form_schema`:
   - `source_ref = spreadsheetId:tabName`
   - `name = nome da aba/planilha (ex.: IEA1)`
3) Para cada linha:
   - `p_dedupe_key = filehash:rowNumber`
   - `p_answers = { key(header)->value(cell) }`
   - `ingest_form_submission(...)`

Resultado:
- Lead normalizado via email
- `form_submissions` + `form_answers` preservam a pesquisa inteira sem precisar “saber perguntas antes”
- `lead_id` liga a submissão ao lead, deixando tudo consultável/analytics-ready
