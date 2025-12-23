# Dumps do banco de dados Supabase local

Este diretório contém dumps do banco de dados para backup e restauração.

## Como usar:

### Criar dump:
```bash
pnpm run db:dump          # Dump em SQL (não comprimido)
pnpm run db:dump:gz       # Dump comprimido (recomendado)
```

### Restaurar dump:
```bash
# SQL não comprimido
pnpm run db:restore dumps/dump_20250122_123456.sql

# SQL comprimido
gunzip -c dumps/dump_20250122_123456.sql.gz | docker exec -i supabase_db_tetra-metrics psql -U postgres -d postgres
```

## Nota:
- Os dumps são criados com timestamp automático
- Use `db:dump:gz` para economizar espaço (recomendado)
- Certifique-se de que o Supabase local está rodando antes de fazer dump/restore

