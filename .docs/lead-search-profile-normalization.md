# Job: Normalização do `lead_search_profile`

## O que este job faz (visão geral)

O job `normalize-lead-search-profile` preenche/atualiza a tabela `public.lead_search_profile` a partir das respostas de pesquisas importadas.

Ele **NÃO** varre a tabela `leads` diretamente. Ele:

- Resolve quais perguntas (`form_questions`) interessam para o perfil (salário, idade, gênero, porte, escolaridade)
- Lê `form_answers` em lotes (com `JOIN` em `form_submissions` para obter `lead_id`)
- Normaliza os valores (ex.: faixas salariais, idade, aliases de gênero/porte/escolaridade)
- Faz `upsert` em `lead_search_profile` por `lead_id`
- Persiste o estado do job em `job_runs` (cursor + contadores) para permitir retomada

Arquivos principais:

- Runner: `src/scripts/leads/normalize-lead-search-profile.ts`
- Use case: `src/modules/leads/application/use-cases/normalize-lead-search-profile.use-case.ts`
- Repo (Supabase): `src/modules/leads/infra/repositories/supabase-normalize-lead-search-profile.repository.ts`
- Chaves esperadas: `src/modules/leads/domain/normalization/normalization.constants.ts`

## Quais tabelas ele usa

- `form_questions`: catálogo de perguntas (geradas a partir dos headers da planilha)
- `form_submissions`: submissões/linhas importadas (contém `lead_id`)
- `form_answers`: respostas por pergunta (1 célula → 1 answer)
- `lead_search_profile`: destino do perfil normalizado (1:1 por `lead_id`)
- `job_runs`: observabilidade/estado do job (cursor e contadores)

## Como ele encontra as perguntas (match por `ilike`)

Como os headers das planilhas geralmente viram frases longas (ex.: `qual-o-porte-da-empresa-em-que-trabalha`), a resolução de perguntas é feita por **substring** em `form_questions.key_normalized`.

As chaves base estão em `PROFILE_FIELD_TO_QUESTION_KEYS`, por exemplo:

- `gender`: `genero`, `sexo`, `gender`
- `companySize`: `porte`, `porte-empresa`, `company-size`
- `educationLevel`: `escolaridade`, `schooling`, `education-level`
- `salaryMin/salaryMax`: variações de `salary-min`, `salario-minimo`, etc
- `ageMin/ageMax`: `age-min`, `idade-minima`, etc

Internamente:

- A repo busca `form_questions` com `key_normalized ilike '*<chave>*'`
- Depois associa cada `question_id` encontrado ao campo do perfil correspondente

## Como ele pagina `form_answers` (cursor)

O job lê `form_answers` em ordem crescente por:

- `created_at ASC`
- `id ASC`

Cursor (quando existe):

- `created_at > cursor.createdAt`
  **OU**
- `created_at = cursor.createdAt AND id > cursor.id`

Isso evita reprocessar a mesma linha e permite retomar do ponto onde parou.

## Observabilidade: logs e razões de “0 processado”

O job passou a explicitar por que não processou nada:

- `completionReason = no_questions_found`
  - Quando nenhuma `form_questions.key_normalized` bate com as chaves esperadas
  - O log inclui `unmatchedKeys` (as chaves que não tiveram match)
- `completionReason = no_answers_found`
  - Quando há perguntas resolvidas, mas o primeiro batch de `form_answers` retorna vazio
  - O log inclui `cursorAtStart`, `questionIdsCount`, `batchSize`, etc

Também existe log de debug de leitura de batch (cursor/limit/quantidade retornada) quando `NORMALIZE_DEBUG=true` ou `--debug`.

## Retomada (padrão) e por que pode “terminar em 1 segundo”

Por padrão (`fromStart=false`), o job **retoma do último `job_run`**:

- O cursor base vem do `job_runs.cursor_created_at` + `job_runs.cursor_id` do run anterior.
- Os contadores iniciais (`processedRows`/`processedLeads`) também podem ser **herdados** do run anterior, para refletir continuidade.

Isso significa que é comum ver uma execução finalizar quase instantaneamente quando:

- O cursor já está no “fim” do dataset, e
- O primeiro `readFormAnswersBatch` retorna vazio

Nesse caso, o job finaliza com `meta.reason = "no_answers_found"` e os contadores podem aparecer “altos” mesmo sem ter processado nada novo naquela execução (eles representam o acumulado da retomada).

Para reprocessar tudo do zero, use `--from-start` (ou `fromStart=true` quando exposto via API).

## Como executar

Script:

- `pnpm job:normalize-leads`

### Flags (argv)

- `--batch-size=<n>`: tamanho do lote (default 500; também aceita `NORMALIZE_BATCH_SIZE`)
- `--dry-run`: não faz upsert em `lead_search_profile` (somente leitura/contagem)
- `--from-start`: ignora retomada por `job_runs` e começa com cursor nulo
- `--debug`: habilita logs extras (também seta `NORMALIZE_DEBUG=true`)

Exemplos:

```bash
pnpm job:normalize-leads -- --batch-size=200 --dry-run --from-start --debug
```

```bash
NORMALIZE_BATCH_SIZE=5000 NORMALIZE_DRY_RUN=true NORMALIZE_FROM_START=true NORMALIZE_DEBUG=true pnpm job:normalize-leads
```

## Pré-requisitos para “funcionar”

Para o job processar leads, é necessário:

- Existirem `form_questions` com `key_normalized` contendo termos relacionados aos campos do perfil (ex.: `sexo`, `porte`, `escolaridade`, etc)
- Existirem `form_submissions.lead_id` preenchidos (o job ignora respostas sem `lead_id`)
- Existirem `form_answers` para essas `question_id`
