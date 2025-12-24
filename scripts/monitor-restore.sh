#!/bin/bash

# Script para monitorar o progresso do restore

if [ -f .env ]; then
  export DATABASE_URL_OFICIAL=$(grep -E "^DATABASE_URL_OFICIAL=" .env | cut -d= -f2- | sed 's/^"//;s/"$//')
fi

echo "📊 Monitorando progresso do restore..."
echo ""

while true; do
  clear
  echo "=== Status do Restore ==="
  echo ""
  
  # Verificar se o processo ainda está rodando
  if ps aux | grep -E "[r]estore-tables.sh" > /dev/null; then
    echo "✅ Processo de restore em execução"
  else
    echo "⏹️  Processo de restore finalizado"
  fi
  
  echo ""
  echo "📈 Contagem de registros nas tabelas principais:"
  psql -d "$DATABASE_URL_OFICIAL" -c "
    SELECT 
      'tags' as tabela, COUNT(*)::text as total FROM tags
    UNION ALL
    SELECT 'tag_aliases', COUNT(*)::text FROM tag_aliases
    UNION ALL
    SELECT 'leads', COUNT(*)::text FROM leads
    UNION ALL
    SELECT 'lead_identifiers', COUNT(*)::text FROM lead_identifiers
    UNION ALL
    SELECT 'form_schemas', COUNT(*)::text FROM form_schemas
    UNION ALL
    SELECT 'form_questions', COUNT(*)::text FROM form_questions
    UNION ALL
    SELECT 'form_submissions', COUNT(*)::text FROM form_submissions
    UNION ALL
    SELECT 'form_answers', COUNT(*)::text FROM form_answers;
  " 2>&1 | grep -v "count\|----\|row"
  
  echo ""
  echo "📝 Últimas linhas do log:"
  tail -5 /tmp/restore_full.log 2>/dev/null || echo "Log não disponível ainda"
  
  echo ""
  echo "Pressione Ctrl+C para sair"
  sleep 5
done


