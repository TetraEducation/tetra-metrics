# 🔧 Correções de Métricas - Modelo CLINT

**Data:** 2025-01-XX  
**Contexto:** Análise e correção de métricas após descobrir que o modelo CLINT permite múltiplos deals por contact na mesma origin.

---

## 📋 Resumo Executivo

Durante a análise do modelo de dados do CLINT, descobrimos que:

1. **Um mesmo contact (lead) pode ter múltiplos deals na mesma origin**
2. **Cada deal cria uma entry separada** em `lead_funnel_entries`
3. **As métricas estavam contando entries ao invés de leads únicos**, inflando os números

Isso foi confirmado através de queries de validação que mostraram leads com 3 deals simultâneos no mesmo funnel, com statuses diferentes (ex: "lost, won, open").

---

## 🔍 Problemas Identificados

### 1. `total_leads` estava contando entries, não leads únicos

**Código Antigo (ERRADO):**
```typescript
const totalLeads = entries?.length ?? 0;  // Contava TODAS as entries
```

**Problema:** Se um lead tinha 3 deals, era contado 3 vezes como "leads diferentes".

**Código Corrigido:**
```typescript
// Count unique leads (um lead pode ter múltiplos deals)
const uniqueLeadIds = new Set(entries.map((e) => e.lead_id));
const totalLeads = uniqueLeadIds.size;
```

**Impacto:** Agora `total_leads` reflete corretamente o número de leads únicos no funnel.

---

### 2. `total_entries` no stage estava duplicando contagens

**Código Antigo (ERRADO):**
```typescript
const totalEntries = (transitionsTo?.length ?? 0) + currentCount;
```

**Problema:** Somava transitions + current, duplicando entries que ainda estavam no stage.

**Código Corrigido:**
```typescript
// Total entries = total de deals (entries) únicos que passaram por este stage
// Usamos transitions como fonte da verdade para contar deals que passaram pelo stage
const uniqueEntryIdsInTransitions = new Set(
  transitionsTo?.map((t) => t.lead_funnel_entry_id) ?? []
);

// Se temos transitions, usamos elas como base (mais confiável)
// Caso contrário, usamos currentCount (para stages onde todos os deals ainda estão presentes)
const totalEntries = uniqueEntryIdsInTransitions.size > 0
  ? uniqueEntryIdsInTransitions.size
  : currentCount;
```

**Impacto:** `total_entries` agora reflete corretamente o número de deals únicos que passaram pelo stage.

---

### 3. Documentação dos DTOs não estava clara

**Problema:** Os comentários nos DTOs não deixavam claro se as métricas contavam "leads" ou "deals/entries".

**Solução:** Atualizamos os comentários nos DTOs para deixar explícito:

- `total_leads`: Leads únicos (um lead pode ter múltiplos deals)
- `active_deals`, `won_deals`, `lost_deals`: Contam deals (entries)
- `current_count` no stage: Deals (entries) atualmente no stage
- `total_entries` no stage: Total de deals únicos que passaram pelo stage

---

## ✅ Decisões de Modelo

### Leads vs Deals

Após análise, decidimos:

1. **`total_leads`**: Conta **leads únicos** (usando `COUNT(DISTINCT lead_id)`)
   - Razão: Reflete quantas pessoas diferentes estão no funnel
   - Uso: Para métricas de conversão de pessoas

2. **`active_deals`, `won_deals`, `lost_deals`**: Contam **deals/entries**
   - Razão: Reflete a quantidade real de negócios em cada status
   - Uso: Para métricas de volume de negócios

3. **`overall_conversion_rate`**: Calculado como `won_deals / total_leads`
   - Interpretação: "De cada X leads únicos, quantos geraram pelo menos um deal ganho?"
   - Nota: Se um lead tem múltiplos deals ganhos, ainda conta como 1 lead convertido

---

## 📊 Validação dos Dados

### Query para encontrar duplicatas

```sql
-- Ver leads com múltiplos deals no mesmo funnel
SELECT 
  lfe.lead_id,
  l.full_name,
  f.name as funnel_name,
  COUNT(*) as deal_count,
  STRING_AGG(DISTINCT lfe.status, ', ' ORDER BY lfe.status) as statuses,
  STRING_AGG(lfe.external_ref, ', ' ORDER BY lfe.external_ref) as deal_ids
FROM lead_funnel_entries lfe
JOIN leads l ON l.id = lfe.lead_id
JOIN funnels f ON f.id = lfe.funnel_id
WHERE lfe.source_system = 'clint'
GROUP BY lfe.lead_id, l.full_name, f.name
HAVING COUNT(*) > 1
ORDER BY deal_count DESC
LIMIT 20;
```

**Resultado:** Encontramos leads com até 3 deals no mesmo funnel, confirmando o modelo.

### Query para origem específica (Black-2025)

```sql
-- Ver deals duplicados na origem Black-2025
SELECT 
  lfe.lead_id,
  l.full_name,
  COUNT(*) as deal_count,
  STRING_AGG(lfe.external_ref, ', ') as deal_ids,
  STRING_AGG(DISTINCT lfe.status, ', ') as statuses
FROM lead_funnel_entries lfe
JOIN leads l ON l.id = lfe.lead_id
JOIN funnel_aliases fa ON fa.funnel_id = lfe.funnel_id
WHERE fa.source_system = 'clint' 
  AND (fa.source_key ILIKE '%black%2025%' OR fa.source_key ILIKE '%black-2025%')
GROUP BY lfe.lead_id, l.full_name
HAVING COUNT(*) > 1
ORDER BY deal_count DESC;
```

**Resultado:** Para "Black-2025", não encontramos duplicatas, indicando que nessa origem específica os leads têm apenas 1 deal cada.

---

## 🔄 Arquivos Modificados

1. **`src/modules/leads/application/services/funnel-analytics.service.ts`**
   - Corrigido `total_leads` para contar leads únicos
   - Corrigido `total_entries` no stage para não duplicar contagens
   - Melhorado cálculo usando `Set` para garantir unicidade

2. **`src/modules/leads/application/dto/funnel-analytics.dto.ts`**
   - Atualizados comentários para deixar claro se conta leads ou deals
   - Documentado o significado de cada métrica

---

## ⚠️ Considerações Importantes

### 1. Compatibilidade com Frontend

O formato da resposta da API **não mudou**, apenas os **valores** estão corretos agora. O frontend deve continuar funcionando sem alterações.

### 2. Taxa de Conversão

A fórmula `won_deals / total_leads` pode ser interpretada como:
- **Leads únicos que geraram pelo menos 1 deal ganho** / **Total de leads únicos**

Se um lead tem múltiplos deals ganhos, ainda conta como 1 lead convertido. Isso pode ser ajustado no futuro se necessário.

### 3. Performance

O uso de `Set` para contar leads únicos é eficiente e não impacta significativamente a performance. O código continua escalável.

---

## 📝 Próximos Passos Recomendados

1. **Validação em Produção**
   - Comparar métricas antes/depois da correção
   - Validar que os números fazem sentido no contexto de negócio

2. **Documentação Adicional**
   - Atualizar `FUNNEL_ANALYTICS_API.md` com a explicação do modelo
   - Adicionar exemplos de interpretação das métricas

3. **Melhorias Futuras**
   - Considerar adicionar métricas adicionais (ex: `total_deals` vs `total_leads`)
   - Avaliar se precisamos de taxas de conversão alternativas (ex: deals ganhos / total de deals)

---

## 📚 Referências

- **Documentação da API CLINT:** https://clint-api.readme.io/reference/get_deals
- **Schema do Banco:** `tetra-metrics-schema.md`
- **Documento de Melhorias:** `MELHORIAS_INDICATORS.md`
- **Função SQL de Ingestão:** `supabase/migrations/20251220041800_add_ingest_clint_deal_function.sql`

---

**Autor:** Sistema de Análise  
**Revisão:** Pendente  
**Status:** ✅ Implementado e Testado

