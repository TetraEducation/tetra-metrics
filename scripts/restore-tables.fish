#!/usr/bin/env fish

# Script para restaurar tabelas individuais do Supabase remoto (Fish Shell)
# Uso: fish scripts/restore-tables.fish [--clean]

set CLEAN_BEFORE_RESTORE false
if test (count $argv) -gt 0
  if test "$argv[1]" = "--clean" -o "$argv[1]" = "-c"
    set CLEAN_BEFORE_RESTORE true
    echo "⚠️  Modo CLEAN ativado: tabelas serão limpas antes de restaurar"
  end
end

# Carregar .env se existir e variável não estiver definida
if test -z "$DATABASE_URL_OFICIAL"
  if test -f .env
    set -gx DATABASE_URL_OFICIAL (grep "^DATABASE_URL_OFICIAL=" .env | cut -d= -f2- | string trim)
  end
end

set DUMP_DIR "dumps/dumps_chunks"

if test -z "$DATABASE_URL_OFICIAL"
  echo "❌ Erro: Variável DATABASE_URL_OFICIAL não está definida"
  echo "Defina com: set -x DATABASE_URL_OFICIAL 'postgresql://...'"
  echo "Ou adicione no arquivo .env"
  exit 1
end

if not test -d "$DUMP_DIR"
  echo "❌ Erro: Diretório $DUMP_DIR não existe"
  exit 1
end

echo "Iniciando restore de tabelas individuais..."
echo "Diretório: $DUMP_DIR"
echo ""

# Ordem recomendada (tabelas pequenas primeiro, depois as grandes)
set TABLES tags tag_aliases form_schemas form_questions funnels funnel_stages funnel_aliases funnel_stage_aliases lead_stats leads lead_identifiers lead_sources lead_tags lead_events lead_funnel_entries lead_funnel_transitions form_submissions form_answers

for table in $TABLES
  set DUMP_FILE "$DUMP_DIR/$table.sql"
  
  if not test -f "$DUMP_FILE"
    echo "⚠️  Arquivo não encontrado: $DUMP_FILE (pulando)"
    continue
  end
  
  set FILE_SIZE (du -h "$DUMP_FILE" | cut -f1)
  echo "Restaurando tabela: $table ($FILE_SIZE)"
  
  # Limpar tabela antes de restaurar se solicitado
  if test "$CLEAN_BEFORE_RESTORE" = "true"
    echo "  Limpando tabela $table..."
    psql -d "$DATABASE_URL_OFICIAL" -c "TRUNCATE TABLE public.$table CASCADE;" 2>&1 | grep -v "NOTICE:" > /dev/null; or true
  end
  
  # Filtrar apenas comandos backslash problemáticos (manter \. que é necessário para COPY)
  # Remove: \connect, \c, \set, \echo, etc. mas mantém \. (fim do COPY)
  set OUTPUT (cat "$DUMP_FILE" | grep -v -E '^\\[^.]' | psql -d "$DATABASE_URL_OFICIAL" 2>&1)
  set EXIT_CODE $status
  
  # Se houver erro de duplicata e não estiver em modo clean, avisar mas continuar
  if echo "$OUTPUT" | grep -q "duplicate key value violates unique constraint"
    if test "$CLEAN_BEFORE_RESTORE" = "false"
      echo "  ⚠️  Aviso: Alguns registros já existem (duplicatas ignoradas)"
      echo "  💡 Use --clean para limpar as tabelas antes de restaurar"
    end
    echo "✅ $table processado (com avisos de duplicatas)"
  else if test $EXIT_CODE -eq 0
    echo "✅ $table restaurado com sucesso"
  else
    echo "❌ Erro ao restaurar $table"
    echo "$OUTPUT" | tail -5
    echo "Continuando com próxima tabela..."
  end
  echo ""
end

echo "Restore concluído!"

