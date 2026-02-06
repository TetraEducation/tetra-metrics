# Leads - Listagem, detalhes e exportação

## Endpoints

### Jobs (normalização de perfil de busca)

O backend mantém um histórico de execuções de jobs na tabela `job_runs` e expõe endpoints para o frontend:

- **Ver execuções recentes** (para status/monitoramento)
- **Disparar manualmente** o job `normalize-lead-search-profile` (para um botão no painel)

#### GET `/leads/jobs/runs`

Lista execuções recentes (ordenadas por `started_at` desc).

**Query params (opcionais)**

| Parâmetro | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `jobName` | string | não | Filtra por nome do job. Ex.: `normalize-lead-search-profile`. |
| `status` | enum | não | `running`, `failed` ou `completed`. |
| `limit` | number | não | Quantidade de itens (default 20, máximo 100). |

**Exemplo de request**

```http
GET /leads/jobs/runs?jobName=normalize-lead-search-profile&limit=20
```

**Exemplo de response**

```json
[
  {
    "id": "0b2f7d5a-0f5b-4c86-bf7a-2f0b0e3b0a91",
    "job_name": "normalize-lead-search-profile",
    "status": "completed",
    "started_at": "2026-02-06T13:00:00.000Z",
    "finished_at": "2026-02-06T13:01:40.000Z",
    "processed_rows": 500,
    "processed_leads": 120,
    "error_message": null,
    "meta": { "trigger": "scheduler" },
    "cursor_created_at": "2026-02-06T12:59:59.000Z",
    "cursor_id": "e7c0a6a1-0c53-4b9b-9f4a-6e8b9c4d7b31"
  }
]
```

#### POST `/leads/jobs/normalize-lead-search-profile/run`

Dispara manualmente o job `normalize-lead-search-profile`.

- Retorna **`202 Accepted`** imediatamente (o processamento roda em background no servidor).
- Se já existir execução em andamento, retorna **`409 Conflict`**.

**Exemplo de request**

```http
POST /leads/jobs/normalize-lead-search-profile/run
```

**Exemplo de response (202)**

```json
{ "accepted": true }
```

#### Como o frontend deve implementar (sugestão)

- **Tela/Widget “Normalização de filtros”**
  - Mostrar:
    - Status atual: `running` / `completed` / `failed`
    - Última execução (`started_at`, `finished_at`)
    - Progresso (opcional): `processed_rows`, `processed_leads`
    - Erro (quando `failed`): `error_message`

- **Carregar estado inicial**
  - Chamar `GET /leads/jobs/runs?jobName=normalize-lead-search-profile&limit=1`
  - Se vier vazio, tratar como “nunca executou”.

- **Botão “Rodar agora”**
  - Desabilitar se o status atual for `running`.
  - Ao clicar:
    - Fazer `POST /leads/jobs/normalize-lead-search-profile/run`
    - Se retornar `202`, atualizar UI para “em execução” e iniciar polling.
    - Se retornar `409`, exibir mensagem “Já existe uma execução em andamento” e iniciar polling (porque já está rodando).

- **Polling para atualizar status**
  - Enquanto `running`, fazer polling em `GET /leads/jobs/runs?jobName=normalize-lead-search-profile&limit=1`:
    - Intervalo recomendado: **3–5s** nos primeiros 30s, depois **10–15s**.
  - Parar o polling quando status mudar para `completed` ou `failed`.

- **Tratamento de erros de rede**
  - Se o polling falhar, manter o último status exibido e re-tentar (ex.: backoff simples).

#### Execução automática (scheduler)

- Existe um scheduler no backend que roda **semanalmente (domingo 02:00 America/Sao_Paulo)**.
- Ele só roda quando `ENABLE_NORMALIZATION_JOB=true` no ambiente do servidor.

### GET `/leads/list`

Endpoint de listagem paginada de leads (novo controller `LeadsListingController`).

**Implementação (referência)**

- Controller: `src/modules/leads/interface/http/leads-listing.controller.ts`
- DTO (query params): `src/modules/leads/application/dto/leads-listing.dto.ts`
- Service: `src/modules/leads/application/services/leads-listing.service.ts`
- Repositório (Supabase): `src/modules/leads/infra/repositories/supabase-leads.repository.ts` (`listLeads`)

**Parâmetros de paginação**

| Parâmetro | Tipo   | Obrigatório | Descrição                                    |
| --------- | ------ | ----------- | -------------------------------------------- |
| `page`    | number | não         | Página atual (mínimo `1`).                   |
| `perPage` | number | não         | Quantidade de itens por página (mínimo `1`). |

**Filtros**

| Parâmetro        | Tipo   | Obrigatório | Descrição                                                                                      |
| ---------------- | ------ | ----------- | ---------------------------------------------------------------------------------------------- |
| `campaignName`   | string | não         | Filtra por **nome da campanha** (busca por substring) em tags associadas ao lead. Ex.: `CPB8`. |
| `tag`            | string | não         | Filtra pela **chave da tag** associada ao lead. Ex.: `IEA5`.                                   |
| `campaignTagKey` | string | não         | Filtra pela chave de campanha associada ao lead.                                               |
| `tagId`          | string | não         | Filtra pelo **UUID** da tag vinculada ao lead.                                                 |
| `hasClintSource` | boolean | não        | `true` para leads com ao menos um registro em `lead_sources` com `source_system = 'clint'`; `false` para leads sem esse registro. |
| `salaryMin`      | number | não         | Filtro por salário mínimo (interseção com `lead_search_profile.salary_min/max`). `0` ignora.   |
| `salaryMax`      | number | não         | Filtro por salário máximo (interseção com `lead_search_profile.salary_min/max`). `0` ignora.   |
| `ageMin`         | number | não         | Filtro por idade mínima (interseção com `lead_search_profile.age_min/max`). `0` ignora.        |
| `ageMax`         | number | não         | Filtro por idade máxima (interseção com `lead_search_profile.age_min/max`). `0` ignora.        |
| `gender`         | enum   | não         | Um dos valores: `male`, `female`, `non_binary`, `other`, `prefer_not_to_say`.                  |
| `companySize`    | enum   | não         | Um dos valores: `micro`, `small`, `medium`, `large`, `enterprise`, `unemployed`.              |
| `educationLevel` | enum   | não         | Um dos valores: `fundamental`, `high_school`, `high_school_incomplete`, `technical`, `bachelor`, `bachelor_incomplete`, `post_graduate`, `master`, `doctorate`. |

**Outros parâmetros úteis**

| Parâmetro          | Tipo   | Obrigatório | Descrição                                                           |
| ------------------ | ------ | ----------- | ------------------------------------------------------------------- |
| `name`             | string | não         | Filtra por nome do lead.                                            |
| `email`            | string | não         | Filtra por e-mail.                                                  |
| `phone`            | string | não         | Filtra por telefone.                                                |
| `lastActivityFrom` | string | não         | Filtra pela data/hora mínima de última atividade (ISO 8601).        |
| `lastActivityTo`   | string | não         | Filtra pela data/hora máxima de última atividade (ISO 8601).        |
| `orderBy`          | string | não         | Campo de ordenação (`last_activity_at`, `created_at`, `full_name`). |
| `orderDirection`   | string | não         | Direção da ordenação (`asc` ou `desc`).                             |

**DTO de response (shape atual)**

O endpoint retorna `LeadsListingResult<LeadListingItem>`:

- `data`: array de itens
  - `nome: string | null`
  - `email: string | null`
  - `telefone: string | null`
  - `ultimoContatoComercial: string | null` (timestamp ISO)
- `page: number`
- `perPage: number`
- `total: number`

**Exemplo de request**

```http
GET /leads/list?page=1&perPage=20&tag=IEA5&salaryMin=1500&salaryMax=10000&gender=female&orderBy=last_activity_at&orderDirection=desc
```

**Exemplo de response**

```json
{
  "data": [
    {
      "nome": "Maria Almeida",
      "email": "maria@email.com",
      "telefone": "+55 11 99999-0000",
      "ultimoContatoComercial": "2024-03-15T14:32:00.000Z"
    }
  ],
  "page": 1,
  "perPage": 20,
  "total": 120
}
```

### GET `/leads/{id}/details`

Endpoint de detalhes completos do lead.

**Exemplo de request**

```http
GET /leads/8c5a4f0a-7c4b-4e0d-9a9b-1b1a2c3d4e5f/details
```

**Exemplo de response**

```json
{
  "id": "8c5a4f0a-7c4b-4e0d-9a9b-1b1a2c3d4e5f",
  "full_name": "Maria Almeida",
  "first_contact_at": "2024-03-01T10:05:00.000Z",
  "last_activity_at": "2024-03-15T14:32:00.000Z",
  "created_at": "2024-03-01T10:05:00.000Z",
  "updated_at": "2024-03-10T09:20:00.000Z",
  "identifiers": [
    {
      "id": "58af5d1e-1225-4c9e-9b8c-721a4e3d3f21",
      "type": "email",
      "value": "maria@email.com",
      "value_normalized": "maria@email.com",
      "is_primary": true,
      "created_at": "2024-03-01T10:05:00.000Z"
    }
  ],
  "sources": [],
  "tags": [],
  "events": [],
  "funnel_entries": [],
  "surveys": []
}
```

### GET `/leads/export`

Exportação CSV com detalhes completos dos leads, respeitando os mesmos filtros da listagem paginada.

**Parâmetros**

Os mesmos parâmetros de paginação e filtros descritos em **GET `/leads/list`**.

**Exemplo de request**

```http
GET /leads/export?tag=IEA5&salaryMin=1500&salaryMax=10000
```

**Exemplo de response**

O retorno é um arquivo CSV. As colunas incluem campos completos do lead (ex.: identificadores, tags, eventos e surveys), conforme a exportação definida pelo serviço.
