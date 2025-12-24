#!/bin/bash

# Script para testar importação de planilha via curl

FILE_PATH="not-import/POWER BI/LEADS GERAIS/CPB2.csv"
BASE_URL="http://localhost:3000"
ENDPOINT="${BASE_URL}/imports/spreadsheet"

echo "Enviando arquivo: ${FILE_PATH}"
echo "Endpoint: ${ENDPOINT}"
echo ""

curl -X POST "${ENDPOINT}" \
  -F "file=@${FILE_PATH}" \
  -F "dryRun=true" \
  -F "sourceSystem=spreadsheet" \
  -F "tagKey=CPB2" \
  -H "Accept: application/json" \
  -v

echo ""
echo "Teste concluído!"

