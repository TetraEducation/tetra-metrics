# Guia de Migrations com Supabase (tetra-metrics)

Este guia define o workflow “DB as Code”: **toda mudança de schema vira migration versionada no Git**.  
Assim, qualquer PC consegue reproduzir o mesmo banco com comandos previsíveis.

---

## 1) Onde ficam as migrations

- Pasta: `supabase/migrations/`
- Formato: `<timestamp>_<nome>.sql`  
  Ex.: `20251220002815_baseline_public.sql`

---

## 2) Subir/Parar o Supabase local do projeto

> Rode sempre no **root** do repo (onde existe `supabase/config.toml`).

### Subir
```bash
supabase start --workdir .
```

### Ver status
```bash
supabase status --workdir .
```

### Parar
```bash
supabase stop --workdir .
```

---

## 3) Criar uma migration nova (manual)

1) Criar o arquivo:
```bash
supabase migration new add_nome_da_migration --workdir .
```

2) Editar o arquivo gerado em `supabase/migrations/..._add_nome_da_migration.sql`
e colocar o SQL (ex.: `create table`, `alter table`, `create index`, `create function`, etc).

3) Aplicar no banco local **sem apagar dados** (aplica só pendentes):
```bash
supabase migration up --local --workdir .
```

---

## 4) Aplicar migrations sem apagar dados (o “dia a dia”)

### Local (mantém dados)
```bash
supabase migration up --local --workdir .
```

### Remoto (projeto linkado)
1) Linkar (uma vez):
```bash
supabase link --workdir .
```

2) Subir migrations pendentes para o remoto:
```bash
supabase db push --workdir .
```

> Importante: “sem apagar dados” depende do conteúdo do SQL.  
> Se a migration for destrutiva (`drop column`, `drop table`), os dados vão embora mesmo.

---

## 5) Reset do banco (zera dados)

Use quando:
- quer validar que o projeto **reconstrói do zero**
- quer um ambiente limpo para testar

```bash
supabase db reset --workdir .
```

---

## 6) Ver “qual migration já subiu” (status/histórico)

### Listar migrations (local)
```bash
supabase migration list --local --workdir .
```

### Listar migrations (remoto, linkado)
```bash
supabase migration list --linked --workdir .
```

> Isso te mostra quais versões estão aplicadas vs pendentes.

---

## 7) Como “remover” uma migration (sem bagunçar o histórico)

### Caso A — A migration AINDA NÃO foi aplicada
Você pode simplesmente deletar o arquivo:
```bash
rm supabase/migrations/<timestamp>_minha_migration.sql
```
E seguir normalmente.

### Caso B — A migration JÁ foi aplicada
**Não apague o arquivo** e não tente “sumir” com ela.  
O caminho correto é criar uma **nova migration de rollback** (revertendo o que foi feito).

Exemplo:
1) Criar rollback:
```bash
supabase migration new rollback_nome --workdir .
```

2) No SQL, desfazer a mudança (ex.: `alter table add column ...`, `create index ...`, etc).

3) Aplicar:
```bash
supabase migration up --local --workdir .
```

---

## 8) Atualizar migrations sem perder dados (boas práticas)

### 8.1 Faça migrations pequenas e incrementais
Evite arquivos gigantes. Fica mais fácil revisar e dar rollback.

### 8.2 Prefira mudanças compatíveis
Exemplos de padrão seguro:
- `alter table add column ...`
- backfill com `update` controlado (quando necessário)

### 8.3 Evite destrutivo sem plano
- `drop column` / `drop table` só com estratégia (backup/arquivamento ou migração de dados antes).

---

## 9) Convenções recomendadas (time/2 PCs)

- Sempre usar `--workdir .` (evita rodar no projeto errado).
- Nunca mudar schema “na mão” e esquecer de virar migration.
- Para validar tudo: rode `supabase db reset` de vez em quando.
- Versione sempre: `supabase/config.toml` + `supabase/migrations/*`.

---

## 10) Dicas rápidas (fish shell)

No fish, variáveis são assim:
```fish
set ts (date +%Y%m%d%H%M%S)
```

---

## 11) Scripts úteis no package.json (opcional)

```json
{
  "scripts": {
    "supabase:start": "supabase start --workdir .",
    "supabase:stop": "supabase stop --workdir .",
    "db:up": "supabase migration up --local --workdir .",
    "db:reset": "supabase db reset --workdir .",
    "m:list:local": "supabase migration list --local --workdir .",
    "m:list:remote": "supabase migration list --linked --workdir ."
  }
}
```
