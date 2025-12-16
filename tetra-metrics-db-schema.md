# tetra-metrics — Schema do Banco (Supabase/Postgres)

Este documento descreve **todas as tabelas** do schema CANONICAL do `tetra-metrics`, com **atributos, finalidade, relacionamentos e regras de unicidade**. A ideia é você usar isso como **fonte única (SSOT)** no código para evitar drift de nomes/colunas.

> Regra de ouro do domínio  
> **Tag ≠ Funil/Origem**.  
> - **Tags**: rótulos “muitos-para-muitos” (ex.: `CPB13`, `VIP`, `BlackFriday`).  
> - **Funil/Origem (Clint)**: “onde o lead está” em um pipeline (card/etapa/status), modelado como **instância** em `lead_funnel_entries`.

---

## Convenções gerais

- **Chaves primárias**: UUID (`gen_random_uuid()`).
- **Timestamps**: `created_at` e `updated_at` onde fizer sentido.
- **Normalização**:
  - `*_normalized` é sempre `lower(btrim(...))` para comparações e `UNIQUE`.
- **Idempotência de importação**:
  - Identidades externas são deduplicadas por **chaves únicas**:
    - `lead_sources (source_system, source_ref)`
    - `lead_events (source_system, dedupe_key)` quando `dedupe_key` existe
    - `lead_funnel_entries (source_system, external_ref)`
    - `tags (key_normalized)`
    - `tag_aliases (source_system, source_key)`
- **Colunas `meta`/`payload`**: `jsonb` para armazenar dados extras do fornecedor sem quebrar o schema.

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

**Índices**
- `idx_lead_identifiers_lead_id (lead_id)`
- `idx_lead_identifiers_primary (lead_id, is_primary desc)`

---

## 3) `lead_sources`
**Finalidade:** Vincula o lead a registros externos (Clint, ActiveCampaign, planilha, etc.).  
É aqui que você “amarra” **o ID externo** ao lead canônico.

| Coluna | Tipo | Obrigatório | Observações |
|---|---:|:---:|---|
| `id` | uuid | ✅ | PK |
| `lead_id` | uuid | ✅ | FK → `leads.id` (cascade) |
| `source_system` | text | ✅ | Ex.: `clint`, `activecampaign`, `spreadsheet` |
| `source_ref` | text | ✅ | ID/Ref externo do lead |
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
| `source_system` | text | ✅ | Quem aplicou (ex.: `clint`) |
| `source_ref` | text | ❌ | ref externa opcional (ex.: ID do evento) |
| `first_seen_at` | timestamptz | ✅ | default `now()` |
| `last_seen_at` | timestamptz | ✅ | default `now()` |
| `meta` | jsonb | ✅ | default `{}` |

**Chave primária composta**
- `PRIMARY KEY (lead_id, tag_id, source_system)`  
Isso permite: o mesmo lead ter a mesma tag vinda de fontes diferentes (se fizer sentido).

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

**Índice**
- `(funnel_id, position)` para ordenação rápida

---

## 11) `lead_funnel_entries`
**Finalidade:** Representa a **instância** do lead dentro de um funil (o “card”), com etapa atual e status.

> Um lead pode ter **várias entradas** (ex.: vários pipelines / deals), cada uma deduplicada por um identificador externo.

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
Isso permite importar “card/deal” repetidamente sem duplicar.

**Índices**
- `lead_id`, `funnel_id`, `current_stage_id`

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

**Índices**
- `qualification_score desc`
- `last_activity_at desc`

---

# Como isso resolve “Tags vs Origem” na prática

- **Tag (`CPB13`)**:
  1) garante que existe em `tags` (por `key_normalized`)  
  2) opcionalmente cria `tag_aliases` (ex.: `activecampaign` usa outro identificador)  
  3) vincula ao lead via `lead_tags`

- **Origem/Funil (Clint)**:
  1) garante que existe `funnels` e suas `funnel_stages`  
  2) mapeia IDs do Clint via `funnel_aliases`  
  3) cria/atualiza um “card” em `lead_funnel_entries` com `external_ref` do Clint  
  4) atualiza `current_stage_id` conforme a etapa no Clint

---

# Checklist de importação (idempotente)

1) **Resolver lead**
- encontrar pelo `lead_sources (source_system, source_ref)`; se não existir:
  - criar `leads`
  - criar `lead_sources`

2) **Criar tags (se necessário)**
- `insert into tags` usando `key = <tag>` e `name = <tag>` (ou nome humano)
- criar `lead_tags` para cada tag do lead

3) **Criar/atualizar funil**
- garantir `funnels`, `funnel_stages`
- upsert em `lead_funnel_entries (source_system, external_ref)`

4) **Eventos**
- inserir em `lead_events` com `dedupe_key` quando existir

5) **Atualizar stats**
- recalcular e gravar em `lead_stats`

---

## Observação sobre RLS / Segurança
Este schema está focado em estrutura. Políticas de RLS (Row Level Security), multi-tenant e papéis de acesso entram na próxima etapa, pois dependem de como você vai “ancorar” tenant/usuário no `tetra-iam`/`tetra-tenants`.

