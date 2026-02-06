# Leads - Listagem, detalhes e exportação

## Endpoints

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
| `salaryRange`    | string | não         | Filtra pela faixa salarial informada no lead (busca por substring no valor salvo).             |

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
GET /leads/list?page=1&perPage=20&tag=IEA5&salaryRange=1.500&orderBy=last_activity_at&orderDirection=desc
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
GET /leads/export?tag=IEA5&salaryRange=1.500
```

**Exemplo de response**

O retorno é um arquivo CSV. As colunas incluem campos completos do lead (ex.: identificadores, tags, eventos e surveys), conforme a exportação definida pelo serviço.
