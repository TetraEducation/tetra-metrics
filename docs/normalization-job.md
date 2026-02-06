# Normalization Job

Este documento descreve o job de normalização que gera e mantém o snapshot de leitura indexado, mantendo **forms** como camada canônica.

## Objetivo

- Transformar dados canônicos (forms) em uma projeção otimizada para busca/listagem.
- Aplicar parsing/normalização consistente.
- Permitir processamento incremental, resiliente e observável.

---

## Fluxo do job

1. **Bootstrap**
   - Carrega configuração (batch size, timeout, origem, estratégia de retry).
   - Recupera último cursor persistido.

2. **Leitura incremental da origem (forms)**
   - Busca registros com `updated_at`/`id` acima do cursor.
   - Ordenação estável para evitar duplicidade/perda em retomadas.

3. **Parsing e normalização**
   - Limpeza de texto (trim, casefold, remoção de ruído conforme regra).
   - Mapeamento de campos para formato de busca.
   - Derivação de atributos auxiliares para filtro e ordenação.

4. **Upsert no snapshot**
   - Persistência idempotente por chave de negócio/chave técnica.
   - Atualização somente quando houver mudança relevante.

5. **Atualização de cursor (checkpoint)**
   - Cursor avança apenas após persistência bem-sucedida do batch.
   - Em falha, cursor não avança (garante reprocessamento seguro).

6. **Finalização e métricas**
   - Emite contadores, tempos por etapa e status final.
   - Mantém trilha para auditoria operacional.

---

## Cursor e resume

### Requisitos
- Cursor monotônico (ex.: `updated_at + id` para desempate determinístico).
- Checkpoint por batch commitado.
- Execução idempotente (reprocessar não deve corromper estado).

### Estratégia de retomada
- Ao reiniciar, o job lê do último cursor confirmado.
- Batches parcialmente processados são reexecutados.
- Registros repetidos são absorvidos por upsert idempotente.

---

## Modelo das 2 tabelas

## 1) Tabela canônica (forms)

Responsável por guardar dado de origem, íntegro e completo.

Campos típicos (exemplo):
- `id` (PK)
- `payload` (json/text estruturado canônico)
- `status` (estado de negócio)
- `created_at`
- `updated_at`

## 2) Tabela de snapshot normalizado

Responsável por leitura performática e indexada.

Campos típicos (exemplo):
- `form_id` (FK lógica para forms)
- `search_text_normalized`
- `filter_a`, `filter_b`, ...
- `sort_key`
- `snapshot_version`
- `normalized_at`
- `source_updated_at`

Índices recomendados:
- Índice por `search_text_normalized` (de acordo com padrão de busca adotado).
- Índices compostos para filtros mais comuns.
- Índice por `source_updated_at` para auditoria/diagnóstico.

---


## Decisão aplicada para representação textual de faixas

**Escolha: Opção 1 — reconstituir texto no momento do export a partir de `salary_min/salary_max` e `age_min/age_max`.**

### Justificativa
- Evita duplicação de fonte de verdade no snapshot (não persistimos coluna textual redundante).
- Mantém o snapshot focado em filtros/indexação por dados normalizados numéricos.
- Permite evoluir o formato textual sem migração de dados históricos.

### Implementação
- A formatação foi centralizada em função dedicada de domínio (`formatSalaryRange` e `formatAgeRange`).
- O parser e o formatter são validados com testes de round-trip (`parse -> format -> parse`) para garantir consistência entre forma normalizada e representação textual.

## Logs estruturados esperados

Cada execução deve produzir logs estruturados (JSON) com campos mínimos:

- `event` (ex.: `normalization_job_started`, `batch_processed`, `normalization_job_finished`, `normalization_job_failed`)
- `job_id`
- `cursor_start` / `cursor_end`
- `batch_size`
- `records_read`
- `records_upserted`
- `records_skipped`
- `duration_ms`
- `error_code` / `error_message` (em falha)
- `retry_count`
- `timestamp`

Esses logs permitem:
- Observabilidade operacional (latência, taxa de erro, throughput).
- Diagnóstico rápido de regressões de parsing.
- Alertas confiáveis por SLO.

---

## Comparação de abordagem

## Opção 1: Job em Nest (camada de aplicação/infrastructure)

**Prós**
- Maior controle de parsing e regras de normalização em TypeScript.
- Melhor observabilidade (logs estruturados, métricas, tracing) integrada ao stack.
- Mais fácil aplicar validações de domínio e tratamento de exceções por tipo.
- Melhor testabilidade (unit + integração) do pipeline.

**Contras**
- Overhead de aplicação em relação a SQL puro para transformações simples.
- Maior complexidade de orquestração operacional.

## Opção 2: SQL puro (views/materialized views/procedures)

**Prós**
- Excelente performance para transformações relacionais simples.
- Menor movimentação entre app e banco.
- Menos componentes de runtime.

**Contras**
- Menor flexibilidade para parsing complexo e regras evolutivas.
- Observabilidade e governança de erro menos ricas no stack atual.
- Testes e versionamento de regras tendem a ficar mais rígidos.

---

## Decisão recomendada para este caso

**Escolha: Opção 1 (Job em Nest).**

Para este cenário, o ganho de controle de parsing, rastreabilidade e observabilidade supera o custo adicional de orquestração. A execução incremental com cursor/resume e upsert idempotente atende à necessidade de performance sem perder governança.

**Diretriz explícita:** manter **forms como camada canônica** (fonte de verdade) e tratar o snapshot normalizado apenas como read model derivado para busca/indexação.
