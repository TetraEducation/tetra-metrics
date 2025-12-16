# tetra-metrics — Prompt Mestre + Especificação do Banco (Supabase/Postgres)

> **Instrução fixa para o ChatGPT/IA:** Antes de responder qualquer coisa sobre o projeto **tetra-metrics**, **leia este arquivo inteiro** e use-o como **fonte de verdade** (SSOT) para decisões de modelagem, integrações e implementação no **NestJS**.

## 1) Contexto do produto

O **tetra-metrics** é uma API (NestJS) que consolida leads vindos de múltiplos canais (planilhas, Clint CRM, ActiveCampaign, formulários etc.) em um **data lake no Supabase (Postgres)** para criar um **prontuário/histórico do lead** e permitir:

- Busca por **nome**, **e-mail** ou **telefone**
- Visualização do **perfil do lead** (dados consolidados + origem + tags)
- **Linha do tempo** (eventos / pontos de contato / mudanças)
- **Estado atual** por fonte (ex.: etapa no Clint, tags no Active)
- **Qualificação** (score + razões) com alta performance

> Regra de ouro: **todo lead novo entra automaticamente** na base canônica.

---

## 2) Conceitos que NÃO podem misturar

### 2.1 Tag (label)
Ex.: `CPB13`, `BLACK-2025`, `INTERESSE-MBA`  
- Serve para **rotular** e **segmentar**.
- Vem de planilhas, Clint, Active etc.
- Um lead pode ter **N tags** simultâneas.
- É excelente para **qualificação (score)**.

### 2.2 Origem no Clint (funil/pipeline/board)
Ex.: “Black - 2025”, “Atendimento Comercial” (lista “ORIGENS”)  
- NÃO é tag. É um **container de processo comercial** (funil).
- Dentro do funil existem **etapas/colunas** (Base, Conexão, Negociação, …).
- Um lead pode estar em **várias origens** porque pode ter **várias oportunidades/negócios** (cards).

✅ Conclusão:  
- **Tag = label**  
- **Origem = funil/pipeline**  
- A ligação Lead ↔ Origem é uma **entrada de funil / negócio** (instância), não “a pessoa” diretamente.

---

## 3) Arquitetura de dados (camadas)

- **RAW/STAGING**: dados brutos por fonte, para auditoria e reprocessamento (opcional, mas recomendado).
- **CANONICAL**: entidades oficiais (leads, identifiers, tags, funis, events…).
- **MART/VIEW**: visões para consulta (search, timeline, profile) e agregados (lead_stats).

Regras:
- Idempotência: rodar sync/import 10x sem duplicar.
- Merge/dedupe: e-mail/telefone são “chaves fortes”; nome é “chave fraca”.
- Timeline é event log (append-only sempre que possível) + snapshot de estado.
- Performance: **não calcular score com JOIN pesado em runtime**. Use **lead_stats** atualizado por job.

---

## 4) Schema CANONICAL (tabelas oficiais)

### 4.1 `leads`
Registro canônico (a “pessoa” / lead consolidado).

Campos sugeridos:
- `id (uuid pk)`
- `full_name (text)`
- `first_name (text, opcional)`
- `last_name (text, opcional)`
- `document (text, opcional)` (se existir CPF/CNPJ etc.)
- `first_contact_at (timestamptz, opcional)` — primeiro contato conhecido
- `last_activity_at (timestamptz, opcional)` — última atividade/alteração relevante
- `created_at (timestamptz)`
- `updated_at (timestamptz)`

Uso:
- Entidade central para “prontuário”.

---

### 4.2 `lead_identifiers`
Identificadores normalizados para dedupe/busca.

Campos sugeridos:
- `id (uuid pk)`
- `lead_id (uuid fk -> leads.id)`
- `type (text)` — `email` | `phone` | `document` | etc.
- `value (text)` — valor original
- `value_normalized (text)` — normalizado (lower/trim, E.164, etc.)
- `is_primary (boolean)`
- `created_at (timestamptz)`

Índices essenciais:
- `unique(type, value_normalized)` (ou unique parcial por regras de negócio)

Uso:
- Dedupe/merge: primeiro tenta por `email_normalized`, depois `phone_e164`.
- Busca: query por e-mail/telefone resolve rápido.

---

### 4.3 `lead_sources`
Mapeia “onde esse lead existe”.

Campos sugeridos:
- `id (uuid pk)`
- `lead_id (uuid fk)`
- `source_system (text)` — `spreadsheet` | `clint` | `active_campaign` | `form` | etc.
- `source_ref (text)` — id do contato/registro no sistema (ou fileId/linha)
- `first_seen_at (timestamptz)`
- `last_seen_at (timestamptz)`
- `meta (jsonb)` — payload mínimo para auditoria
- `unique(source_system, source_ref)`

Uso:
- Rastreabilidade: “de onde veio” e “quando atualizou”.

---

### 4.4 `lead_events`
Event log da timeline.

Campos sugeridos:
- `id (uuid pk)`
- `lead_id (uuid fk)`
- `event_type (text)` — ex.: `imported`, `tag_added`, `stage_changed`, `merged`, `survey_answered`
- `source_system (text)` — de onde veio o evento
- `occurred_at (timestamptz)` — quando aconteceu (no mundo real)
- `ingested_at (timestamptz)` — quando entrou no data lake
- `dedupe_key (text, opcional)` — idempotência (ex.: hash do evento)
- `payload (jsonb)` — detalhes do evento
- `unique(source_system, dedupe_key)` (quando aplicável)

Uso:
- Timeline do lead e auditoria de mudanças.
- Sempre que atualizar estado (ex.: stage), também append um evento.

---

## 5) Tags (segmentação e qualificação)

### 5.1 `tags`
Catálogo canônico. **Ex.: o nome da planilha `CPB13` vira uma tag**.

Campos:
- `id (uuid pk)`
- `key (text)` — ex.: `CPB13`
- `key_normalized (generated)` — lower(trim)
- `name (text)` — display
- `category (text)` — `campaign` | `origin` | `segment` | `interest` | etc.
- `weight (int)` — peso para qualificação (default 1)
- `created_at`, `updated_at`

Índices:
- `unique(key_normalized)`
- `gin_trgm(name)` (para busca/filtro rápido)

---

### 5.2 `tag_aliases`
Mapeia tags que vêm de sistemas diferentes para a tag canônica.

Campos:
- `id (uuid pk)`
- `tag_id (uuid fk -> tags.id)`
- `source_system (text)` — `spreadsheet` | `clint` | `active_campaign`
- `source_key (text)` — nome/id da tag no sistema
- `unique(source_system, source_key)`

Uso:
- “CPB13” pode existir como tag no Clint e no Active; aqui você garante que tudo converge para o mesmo `tags.id`.

---

### 5.3 `lead_tags`
Relacionamento lead↔tag com proveniência.

Campos:
- `lead_id (uuid fk)`
- `tag_id (uuid fk)`
- `source_system (text)`
- `source_ref (text, opcional)` — ex.: `CPB13.csv`, id do contato, etc.
- `first_seen_at`, `last_seen_at`
- `meta (jsonb)`
- `pk(lead_id, tag_id, source_system)`

Uso:
- Sem duplicidade e com rastreabilidade por fonte.

---

## 6) Origens do Clint como Funis (pipelines)

### 6.1 `funnels`
Catálogo canônico de funis/origens (ex.: “Black - 2025”, “Atendimento Comercial”).

Campos:
- `id (uuid pk)`
- `key (text)` — estável (ex.: slug)
- `key_normalized (generated)`
- `name (text)`
- `created_at`, `updated_at`
- `unique(key_normalized)`

---

### 6.2 `funnel_aliases`
Mapeia funil por sistema (Clint) → funil canônico.

Campos:
- `id (uuid pk)`
- `funnel_id (uuid fk)`
- `source_system (text)` — normalmente `clint`
- `source_key (text)` — id/nome do funil no Clint
- `unique(source_system, source_key)`

---

### 6.3 `funnel_stages`
Etapas/colunas de cada funil.

Campos:
- `id (uuid pk)`
- `funnel_id (uuid fk)`
- `key (text)` — ex.: `AGENDADO`
- `key_normalized (generated)`
- `name (text)` — display
- `position (int)` — ordenação
- `unique(funnel_id, key_normalized)`

---

### 6.4 `lead_funnel_entries`
A “oportunidade/negócio” do lead em um funil (instância do card).

Campos:
- `id (uuid pk)`
- `lead_id (uuid fk)`
- `funnel_id (uuid fk)`
- `current_stage_id (uuid fk -> funnel_stages.id, opcional)`
- `status (text)` — `open` | `won` | `lost` | etc.
- `source_system (text)` — `clint`
- `external_ref (text)` — id do negócio/card no Clint
- `first_seen_at`, `last_seen_at`
- `meta (jsonb)`
- `unique(source_system, external_ref)` (idempotência)

Uso:
- Um lead pode ter múltiplas entradas em múltiplos funis, sem virar bagunça.
- Mudança de etapa gera evento `stage_changed` em `lead_events`.

---

## 7) Performance e Qualificação

### 7.1 `lead_stats` (snapshot)
Tabela “cache de leitura” para busca e ranking. **Atualizada por job**.

Campos:
- `lead_id (uuid pk fk -> leads.id)`
- `first_contact_at (timestamptz)`
- `last_activity_at (timestamptz)`
- `distinct_tag_count (int)`
- `event_count (int)`
- `source_count (int)`
- `qualification_score (int)`
- `qualification_reasons (jsonb array)`
- `updated_at (timestamptz)`

Índices:
- `(qualification_score desc)`
- `(last_activity_at desc)`

Uso:
- Endpoint de busca não faz JOIN pesado: consulta rápido `leads + identifiers + lead_stats`.

---

## 8) Fase 2 — Pesquisas (opcional, mas previsto)

> Só implementar quando a fase 2 iniciar.

Tabelas sugeridas:
- `surveys (id, key, name, source_system, created_at)`
- `survey_questions (id, survey_id, key, text, type, position)`
- `survey_responses (id, lead_id, survey_id, question_id, answer_text, answer_json, occurred_at, source_system, external_ref, unique(source_system, external_ref))`

Evento:
- Ao inserir response, append `lead_events.event_type = 'survey_answered'`.

---

## 9) Fluxos de ingestão (como vamos fazer)

### 9.1 Importação de planilhas
Entrada: arquivos tipo `CPB13.csv`, `CPB10.xlsx` etc.

Regras:
1) **Nome do arquivo** (ex.: `CPB13`) cria/resolve uma **tag canônica** (`tags.key=CPB13`, `category='campaign'`).
2) Para cada linha:
   - normalizar identificadores (email, telefone)
   - `upsert lead_identifiers` (dedupe)
   - criar/atualizar `leads`
   - registrar `lead_sources` (`source_system='spreadsheet'`, `source_ref=fileId/rowId`)
   - criar `lead_tags` com `source_system='spreadsheet'`
   - append evento `imported` + `tag_added`
3) Atualizar `lead_stats` ao final do job (ou incremental).

Idempotência:
- `source_ref` deve ser estável (ex.: `fileId:rowNumber`).
- Eventos podem usar `dedupe_key = hash(fileId+rowNumber+eventType)`.

---

### 9.2 Sync do Clint (origens + etapas + tags)
Entrada: API do Clint (contatos, negócios, funis/origens, etapas, tags).

Regras:
- Criar/atualizar `lead_sources (clint)`
- Resolver funil via `funnel_aliases` e criar `lead_funnel_entries` por negócio/card (external_ref).
- Atualizar `current_stage_id` e gerar evento `stage_changed`.
- Tags do Clint:
  - mapear para `tag_aliases (source_system='clint')`
  - aplicar em `lead_tags (source_system='clint')`

---

### 9.3 Sync do ActiveCampaign
Entrada: contatos, tags, status, campanhas.

Regras:
- Mesmo padrão:
  - `lead_sources (active_campaign)`
  - `tag_aliases (active_campaign)`
  - `lead_tags (active_campaign)`
  - eventos relevantes (tag_added, status_changed etc.)

---

## 10) Qualificação (score) — regra de negócio

Regra base:
- **Mais tags/interações = mais qualificado**, com pesos.

Exemplo de score:
- `score = sum(tags.weight) + (event_count * 1) + (open_deals * 3)`
- `qualification_reasons` lista os top motivos (ex.: “Tag CPB13 (+5)”, “Entrou em Agendado (+3)”)

Onde roda:
- No job de ingestão/sync (não no endpoint de busca).

---

## 11) Endpoints alvo (API)

- `GET /leads/search?q=`  
  Retorna lista com:
  - lead básico (nome)
  - identifiers principais (email/telefone)
  - `lead_stats` (score, last_activity)
  - tags principais (opcional, “top 5”)

- `GET /leads/:id`  
  Retorna “prontuário”:
  - dados do lead
  - identifiers
  - sources
  - tags (com proveniência)
  - funis/entries (estado atual)
  - `lead_events` (timeline)

- `GET /leads/:id/timeline?limit=`  
  Timeline paginada.

Observabilidade:
- logs estruturados JSON com `trace_id`/`job_id`
- erros classificados (retryable/fatal)
- métricas por job (import/sync)

---

## 12) Padrões de implementação (NestJS)

- Modularidade:
  - `LeadsModule`, `IdentifiersModule`, `TagsModule`, `FunnelsModule`, `IngestionModule`, `SyncModule`, `StatsModule`
- Jobs:
  - Importação/sync roda via fila (BullMQ) ou cron; sempre idempotente.
- Single Responsibility:
  - “Resolver Identidade” (dedupe) em um serviço próprio (ex.: `LeadIdentityService`).
  - “Aplicar Tag” e “Aplicar Entrada de Funil” em serviços próprios.
- Não calcular score em runtime.

---

## 13) Instrução final para o ChatGPT/IA

Quando o usuário pedir mudanças/decisões:
1) Validar se é **Tag** ou **Funil** ou **Evento**.
2) Propor a menor mudança possível no schema mantendo idempotência.
3) Se envolver performance, sempre preferir **lead_stats** (pré-cálculo).
4) Entregar:
   - decisão curta
   - SQL migration (quando necessário)
   - trechos NestJS mínimos e limpos

