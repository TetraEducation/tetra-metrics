#!/bin/bash

# Script para restaurar tabelas individuais do Supabase remoto
# Uso: ./scripts/restore-tables.sh [--clean]

CLEAN_BEFORE_RESTORE=false
if [ "$1" == "--clean" ] || [ "$1" == "-c" ]; then
  CLEAN_BEFORE_RESTORE=true
  echo "⚠️  Modo CLEAN ativado: tabelas serão limpas antes de restaurar"
fi

# Carregar .env se existir e variável não estiver definida
if [ -z "$DATABASE_URL_OFICIAL" ] && [ -f .env ]; then
  export DATABASE_URL_OFICIAL=$(grep -E "^DATABASE_URL_OFICIAL=" .env | cut -d= -f2- | sed 's/^"//;s/"$//')
fi

DUMP_DIR="dumps/dumps_chunks"

if [ -z "$DATABASE_URL_OFICIAL" ]; then
  echo "❌ Erro: Variável DATABASE_URL_OFICIAL não está definida"
  echo "Defina com: export DATABASE_URL_OFICIAL='postgresql://...'"
  echo "Ou adicione no arquivo .env"
  exit 1
fi

if [ ! -d "$DUMP_DIR" ]; then
  echo "❌ Erro: Diretório $DUMP_DIR não existe"
  exit 1
fi

echo "Iniciando restore de tabelas individuais..."
echo "Diretório: $DUMP_DIR"
echo ""

# Ordem recomendada (tabelas pequenas primeiro, depois as grandes)
TABLES=(
  "tags"
  "tag_aliases"
  "form_schemas"
  "form_questions"
  "funnels"
  "funnel_stages"
  "funnel_aliases"
  "funnel_stage_aliases"
  "lead_stats"
  "leads"
  "lead_identifiers"
  "lead_sources"
  "lead_tags"
  "lead_events"
  "lead_funnel_entries"
  "lead_funnel_transitions"
  "form_submissions"
  "form_answers"
)

for table in "${TABLES[@]}"; do
  DUMP_FILE="$DUMP_DIR/${table}.sql"
  
  if [ ! -f "$DUMP_FILE" ]; then
    echo "⚠️  Arquivo não encontrado: $DUMP_FILE (pulando)"
    continue
  fi
  
  FILE_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
  echo "Restaurando tabela: $table ($FILE_SIZE)"
  
  # Limpar tabela antes de restaurar se solicitado
  if [ "$CLEAN_BEFORE_RESTORE" = true ]; then
    echo "  Limpando tabela $table..."
    psql -d "$DATABASE_URL_OFICIAL" -c "TRUNCATE TABLE public.$table CASCADE;" 2>&1 | grep -v "NOTICE:" || true
  fi
  
  # Filtrar apenas comandos backslash problemáticos (manter \. que é necessário para COPY)
  # Remove: \connect, \c, \set, \echo, etc. mas mantém \. (fim do COPY)
  OUTPUT=$(cat "$DUMP_FILE" | grep -v -E '^\\[^.]' | psql -d "$DATABASE_URL_OFICIAL" 2>&1)
  EXIT_CODE=$?
  
  # Se houver erro de duplicata e não estiver em modo clean, avisar mas continuar
  if echo "$OUTPUT" | grep -q "duplicate key value violates unique constraint"; then
    if [ "$CLEAN_BEFORE_RESTORE" = false ]; then
      echo "  ⚠️  Aviso: Alguns registros já existem (duplicatas ignoradas)"
      echo "  💡 Use --clean para limpar as tabelas antes de restaurar"
    fi
    echo "✅ $table processado (com avisos de duplicatas)"
  elif [ $EXIT_CODE -eq 0 ]; then
    echo "✅ $table restaurado com sucesso"
  else
    echo "❌ Erro ao restaurar $table"
    echo "$OUTPUT" | tail -5
    echo "Continuando com próxima tabela..."
  fi
  echo ""
done

echo "Restore concluído!"

