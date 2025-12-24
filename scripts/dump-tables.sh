#!/bin/bash

# Script para fazer dump de cada tabela separadamente

DUMP_DIR="dumps/dumps_chunks"
mkdir -p "$DUMP_DIR"

# Lista de tabelas
TABLES=(
  "form_answers"
  "form_questions"
  "form_schemas"
  "form_submissions"
  "funnel_aliases"
  "funnel_stage_aliases"
  "funnel_stages"
  "funnels"
  "lead_events"
  "lead_funnel_entries"
  "lead_funnel_transitions"
  "lead_identifiers"
  "lead_sources"
  "lead_stats"
  "lead_tags"
  "leads"
  "tag_aliases"
  "tags"
)

echo "Iniciando dump de tabelas individuais..."
echo "Diretório: $DUMP_DIR"
echo ""

for table in "${TABLES[@]}"; do
  echo "Fazendo dump da tabela: $table"
  
  docker exec supabase_db_tetra-metrics pg_dump -U postgres \
    --schema=public \
    --table="$table" \
    --data-only \
    --no-owner \
    --no-acl \
    --no-privileges \
    --no-tablespaces \
    postgres 2>&1 | grep -v "^pg_dump:" > "$DUMP_DIR/${table}.sql"
  
  EXIT_CODE=${PIPESTATUS[0]}
  
  if [ $EXIT_CODE -eq 0 ]; then
    FILE_SIZE=$(du -h "$DUMP_DIR/${table}.sql" 2>/dev/null | cut -f1)
    echo "✅ $table concluído ($FILE_SIZE)"
  else
    echo "❌ Erro ao fazer dump de $table (código: $EXIT_CODE)"
  fi
  echo ""
done

echo "Dumps concluídos! Arquivos em: $DUMP_DIR"
echo ""
echo "Tamanho total:"
du -sh "$DUMP_DIR"

