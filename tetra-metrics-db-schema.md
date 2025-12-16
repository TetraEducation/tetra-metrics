# tetra-metrics — Schema do Banco (Supabase/Postgres)

Este documento descreve o schema CANONICAL do `tetra-metrics`, com **tabelas, atributos, regras de unicidade e contratos operacionais** (ex.: deduplicação e RPCs).
Use como **SSOT** no código para evitar drift de nomes/colunas.

> Regra de ouro do domínio  
> **Tag ≠ Funil/Origem**.  
> - **Tags**: rótulos “muitos-para-muitos” (ex.: `CPB13`, `VIP`, `BlackFriday`).  
> - **Funil/Origem (Clint)**: pipeline/card/etapa/status, modelado por `lead_funnel_entries`.

---

## Convenções gerais

- **Chaves primárias**: UUID (`gen_random_uuid()`).
- **Timestamps**: `created_at` e `updated_at` onde fizer sentido.
- **Normalização**:
  - `*_normalized` é sempre `lower(btrim(...))` para comparações e `UNIQUE`.
- **Idempotência de importação**:
  - Identidades externas são deduplicadas por **chaves únicas** (quando aplicável):
    - `lead_sources (source_system, source_ref)`
    - `lead_events (source_system, dedupe_key)` quando `dedupe_key` existe
    - `lead_funnel_entries (source_system, external_ref)`
    - `tags (key_normalized)`
    - `tag_aliases (source_system, source_key)`
- **Colunas `meta`/`payload`**: `jsonb` para armazenar dados extras do fornecedor sem quebrar o schema.

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

Tabelas com trigger:
- `leads`
- `tags`
- `funnels`

---

# Tabelas do Domínio

## 1) `leads`
**Finalidade:** Entidade central do domínio. Representa uma pessoa/contato unificado.

| Coluna | Tipo | Obrigatório | Observações |
|---|---:|:---:|---|
| `id` | uuid | ✅ | PK |
| `full_name` | text | ✅ | Nome completo “como veio” |
| `first_name` | text | ❌ | Opcional (derivado) |
| `last_name` | text | ❌ | Opcional (derivado) |
| `document` | text | ❌ | CPF/CNPJ etc. (se houver) |
| `first_contact_at` | timestamptz | ❌ | Primeiro contato conhecido |
| `last_activity_at` | timestamptz | ❌ | Última atividade/evento |
| `created_at` | timestamptz | ✅ | default `now()` |
| `updated_at` | timestamptz | ✅ | atualizado por trigger |

**Índices relevantes**
- `idx_leads_last_activity_at (last_activity_at desc)`
- `idx_leads_full_name_trgm` (GIN trigram para busca por nome)

**Relacionamentos**
- 1:N com `lead_identifiers`, `lead_sources`, `lead_events`, `lead_funnel_entries`
- N:N com `tags` via `lead_tags`
- 1:1 com `lead_stats`

---

## 2) `lead_identifiers`
**Finalidade:** Identificadores deduplicáveis do lead (email, telefone, document, etc.).

| Coluna | Tipo | Obrigatório | Observações |
|---|---:|:---:|---|
| `id` | uuid | ✅ | PK |
| `lead_id` | uuid | ✅ | FK → `leads.id` (cascade) |
| `type` | text | ✅ | Ex.: `email`, `phone`, `document` |
| `value` | text | ✅ | Valor original |
| `value_normalized` | text | ✅ | Valor normalizado para comparação |
| `is_primary` | boolean | ✅ | default `false` |
| `created_at` | timestamptz | ✅ | default `now()` |

**Regra de unicidade**
- `UNIQUE (type, value_normalized)` → garante que um identificador não pertença a dois leads.

**Observação (contrato atual)**
- **Email é o único dedupe** no import (vide seção “Regras de Deduplicação”).

**Índices**
- `idx_lead_identifiers_lead_id (lead_id)`
- `idx_lead_identifiers_primary (lead_id, is_primary desc)`

---

## 3) `lead_sources`
**Finalidade:** Vincula o lead a registros externos (Clint, ActiveCampaign, planilha, etc.).  
No MVP, serve como **rastreio** (observabilidade), não como chave de dedupe.

| Coluna | Tipo | Obrigatório | Observações |
|---|---:|:---:|---|
| `id` | uuid | ✅ | PK |
| `lead_id` | uuid | ✅ | FK → `leads.id` (cascade) |
| `source_system` | text | ✅ | Ex.: `clint`, `activecampaign`, `spreadsheet` |
| `source_ref` | text | ✅ | ID/Ref externo do registro/origem |
| `first_seen_at` | timestamptz | ✅ | default `now()` |
| `last_seen_at` | timestamptz | ✅ | default `now()` |
| `meta` | jsonb | ✅ | default `{}` |

**Regra de unicidade**
- `UNIQUE (source_system, source_ref)`

**Índices**
- `idx_lead_sources_lead_id (lead_id)`
- `idx_lead_sources_system (source_system)`

---

## 4) `lead_events`
**Finalidade:** Timeline **append-only** de eventos do lead (mudança de status, tag adicionada, mensagem enviada, compra, etc.).

| Coluna | Tipo | Obrigatório | Observações |
|---|---:|:---:|---|
| `id` | uuid | ✅ | PK |
| `lead_id` | uuid | ✅ | FK → `leads.id` (cascade) |
| `event_type` | text | ✅ | Ex.: `tag.added`, `deal.stage.changed` |
| `source_system` | text | ✅ | `clint`, `activecampaign` etc. |
| `occurred_at` | timestamptz | ✅ | Quando aconteceu no sistema origem |
| `ingested_at` | timestamptz | ✅ | Quando entrou no seu sistema |
| `dedupe_key` | text | ❌ | Se existir, habilita idempotência |
| `payload` | jsonb | ✅ | default `{}` |

**Regra de unicidade (parcial)**
- `UNIQUE (source_system, dedupe_key)` **apenas** quando `dedupe_key` não é nulo/vazio.

**Índices**
- `idx_lead_events_lead_occurred (lead_id, occurred_at desc)`
- `idx_lead_events_payload_gin` (GIN para JSONB)

---

# Tags (Catálogo + Aliases + Associação)

## 5) `tags`
**Finalidade:** Catálogo canônico de tags.

| Coluna | Tipo | Obrigatório | Observações |
|---|---:|:---:|---|
| `id` | uuid | ✅ | PK |
| `key` | text | ✅ | Identificador curto (ex.: `CPB13`) |
| `key_normalized` | text | ✅ | **generated** `lower(btrim(key))` |
| `name` | text | ✅ | Nome “humano” (pode ser igual a key) |
| `category` | text | ❌ | Ex.: `campaign`, `source`, `segment` |
| `weight` | int | ✅ | default `1` (p/ scoring) |
| `created_at` | timestamptz | ✅ | default `now()` |
| `updated_at` | timestamptz | ✅ | trigger |

**Regra de unicidade**
- `UNIQUE (key_normalized)`

**Índices**
- `idx_tags_name_trgm` (GIN trigram)

---

## 6) `tag_aliases`
**Finalidade:** Mapeia “como a tag se chama” em cada sistema de origem para a tag canônica.

| Coluna | Tipo | Obrigatório | Observações |
|---|---:|:---:|---|
| `id` | uuid | ✅ | PK |
| `tag_id` | uuid | ✅ | FK → `tags.id` (cascade) |
| `source_system` | text | ✅ | Ex.: `clint`, `activecampaign` |
| `source_key` | text | ✅ | Ex.: `cpb13` / `CPB13` / ID interno |

**Regra de unicidade**
- `UNIQUE (source_system, source_key)` → o mesmo alias não aponta para duas tags.

---

## 7) `lead_tags`
**Finalidade:** Associação N:N entre lead e tag, com rastreio de origem.

| Coluna | Tipo | Obrigatório | Observações |
|---|---:|:---:|---|
| `lead_id` | uuid | ✅ | FK → `leads.id` (cascade) |
| `tag_id` | uuid | ✅ | FK → `tags.id` (cascade) |
| `source_system` | text | ✅ | Quem aplicou (ex.: `spreadsheet`) |
| `source_ref` | text | ❌ | ref externa opcional (ex.: `filehash:linha`) |
| `first_seen_at` | timestamptz | ✅ | default `now()` |
| `last_seen_at` | timestamptz | ✅ | default `now()` |
| `meta` | jsonb | ✅ | default `{}` |

**Chave primária composta**
- `PRIMARY KEY (lead_id, tag_id, source_system)`

---

# Funis / “Origens” (Clint) e Etapas

## 8) `funnels`
**Finalidade:** Catálogo de funis/pipelines (“origens” do Clint no sentido de pipeline).

| Coluna | Tipo | Obrigatório | Observações |
|---|---:|:---:|---|
| `id` | uuid | ✅ | PK |
| `key` | text | ✅ | Ex.: `clint-default` |
| `key_normalized` | text | ✅ | generated |
| `name` | text | ✅ | Nome do funil |
| `created_at` | timestamptz | ✅ | default `now()` |
| `updated_at` | timestamptz | ✅ | trigger |

**Regra de unicidade**
- `UNIQUE (key_normalized)`

---

## 9) `funnel_aliases`
**Finalidade:** Mapeia IDs/nomes do funil em cada sistema origem → funil canônico.

| Coluna | Tipo | Obrigatório | Observações |
|---|---:|:---:|---|
| `id` | uuid | ✅ | PK |
| `funnel_id` | uuid | ✅ | FK → `funnels.id` (cascade) |
| `source_system` | text | ✅ | Ex.: `clint` |
| `source_key` | text | ✅ | ID/slug do funil no sistema origem |

**Regra de unicidade**
- `UNIQUE (source_system, source_key)`

---

## 10) `funnel_stages`
**Finalidade:** Etapas do funil (colunas/estágios).

| Coluna | Tipo | Obrigatório | Observações |
|---|---:|:---:|---|
| `id` | uuid | ✅ | PK |
| `funnel_id` | uuid | ✅ | FK → `funnels.id` (cascade) |
| `key` | text | ✅ | Ex.: `new`, `qualified`, `won` |
| `key_normalized` | text | ✅ | generated |
| `name` | text | ✅ | Nome “humano” |
| `position` | int | ✅ | Ordenação no funil |
| `created_at` | timestamptz | ✅ | default `now()` |

**Regra de unicidade**
- `UNIQUE (funnel_id, key_normalized)`

---

## 11) `lead_funnel_entries`
**Finalidade:** Representa a **instância** do lead dentro de um funil (o “card”), com etapa atual e status.

| Coluna | Tipo | Obrigatório | Observações |
|---|---:|:---:|---|
| `id` | uuid | ✅ | PK |
| `lead_id` | uuid | ✅ | FK → `leads.id` (cascade) |
| `funnel_id` | uuid | ✅ | FK → `funnels.id` (cascade) |
| `current_stage_id` | uuid | ❌ | FK → `funnel_stages.id` (set null) |
| `status` | text | ✅ | default `'open'` (ex.: `open`, `won`, `lost`) |
| `source_system` | text | ✅ | Ex.: `clint` |
| `external_ref` | text | ✅ | ID externo do “card/deal” |
| `first_seen_at` | timestamptz | ✅ | default `now()` |
| `last_seen_at` | timestamptz | ✅ | default `now()` |
| `meta` | jsonb | ✅ | default `{}` |

**Regra de unicidade**
- `UNIQUE (source_system, external_ref)`

---

# Cache / Projeções

## 12) `lead_stats`
**Finalidade:** Snapshot/camada de leitura (cache) para consultas rápidas (ranking, filtros, etc.).

| Coluna | Tipo | Obrigatório | Observações |
|---|---:|:---:|---|
| `lead_id` | uuid | ✅ | PK + FK → `leads.id` (cascade) |
| `first_contact_at` | timestamptz | ❌ | “melhor estimativa” |
| `last_activity_at` | timestamptz | ❌ | “melhor estimativa” |
| `distinct_tag_count` | int | ✅ | default `0` |
| `event_count` | int | ✅ | default `0` |
| `source_count` | int | ✅ | default `0` |
| `qualification_score` | int | ✅ | default `0` |
| `qualification_reasons` | jsonb | ✅ | default `[]` |
| `updated_at` | timestamptz | ✅ | default `now()` |

---

# RPCs do Banco (Contrato de Ingestão)

## `public.ingest_spreadsheet_row(...)`
**Finalidade:** Ingestão **idempotente** de uma linha de planilha usando **email como única chave**.  
Garante a tag da campanha (ex.: `CPB13`, derivada do nome do arquivo) e vincula o lead.

### Parâmetros
- `p_email_raw text` — email bruto (entrada)
- `p_full_name text` — nome completo (opcional)
- `p_phone text` — telefone (opcional)
- `p_source_system text` — ex.: `spreadsheet`
- `p_source_ref text` — ref idempotente do import (recomendado: `filehash:linha`)
- `p_tag_key text` — ex.: `CPB13`
- `p_row jsonb` — linha inteira como JSON (auditoria/enriquecimento)

### Efeitos
- Resolve ou cria `leads` via `lead_identifiers(email)`.
- Garante `tags` com `category='campaign'` para `p_tag_key`.
- Upsert em `lead_tags` (lead ←→ tag).
- Upsert em `lead_sources` para rastreio (não é dedupe no MVP).

### Retorno
JSONB:
- `{"status":"ok","lead_id":"...","tag_id":"..."}`  
ou
- `{"status":"ignored","reason":"missing_email"}`

> Segurança: recomenda-se `REVOKE` para `public` e execução via `service_role` no backend.

---

# Checklist de importação (MVP: email-only)

1) **Inferir coluna de email (obrigatório)**  
- Se não detectar com confiança → abortar import.

2) **Para cada linha**
- Se email inválido → ignorar  
- Chamar `ingest_spreadsheet_row(...)` com:
  - `p_tag_key = nome do arquivo (ex.: CPB13)`
  - `p_source_ref = filehash:rowNumber` (idempotente)

3) **Resultado**
- `tags` contém `CPB13`
- leads com email válido aparecem em `leads`
- vínculo em `lead_tags`
