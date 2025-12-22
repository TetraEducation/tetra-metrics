# Sincronização Clint

## Comandos Disponíveis

### Sincronização Completa
```bash
npm run clint:sync
```
Sincroniza tudo: tags, origins, contatos e deals.

### Sincronização Apenas Contatos
```bash
npm run clint:sync:contacts
```
Sincroniza apenas tags, origins e contatos (pula deals).
**Use quando:** Primeira sincronização ou quando quiser atualizar apenas a base de contatos.

### Sincronização Apenas Deals
```bash
npm run clint:sync:deals
```
Sincroniza apenas tags, origins e deals (pula contatos).
**Use quando:** Já tem os contatos sincronizados e quer processar/atualizar apenas os deals.

### Dry Run (Teste)
```bash
npm run clint:sync:dry
```
Executa todo o fluxo SEM salvar dados no banco.
**Use quando:** Quer testar a sincronização antes de executar de verdade.

## Flags Avançadas

Você pode combinar flags manualmente:

```bash
# Pular contatos (vai direto para deals)
npm run clint:sync -- --skip-contacts

# Pular deals (só processa contatos)
npm run clint:sync -- --skip-deals

# Dry run com apenas deals
npm run clint:sync:deals -- --dry-run
```

## Fluxo Recomendado

### 1ª Sincronização (do zero)
```bash
# Primeiro: sincronizar contatos (~134k contatos, pode demorar)
npm run clint:sync:contacts

# Depois: sincronizar deals (~156k deals)
npm run clint:sync:deals
```

### Sincronização Incremental
```bash
# Se só quer atualizar deals (muito mais rápido)
npm run clint:sync:deals
```

### Para Testes/Debug
```bash
# Testar sem salvar
npm run clint:sync:dry

# Testar apenas deals sem salvar
npm run clint:sync:deals -- --dry-run
```

## O que cada fase faz?

### 1. Catálogos (sempre executa)
- Tags
- Origins (funnels)
- Groups
- Lost Status

### 2. Contatos (pode pular com `--skip-contacts`)
- Cria/atualiza leads
- Cria identifiers (email, phone)
- Cria lead_sources
- Vincula lead_tags
- Registra eventos

### 3. Deals (pode pular com `--skip-deals`)
- Cria/atualiza lead_funnel_entries
- Registra lead_funnel_transitions (histórico de mudanças de stage)
- Processa OPEN, WON e LOST separadamente
- Tratamento automático de erros da API do Clint

## Tratamento de Erros

O sync agora inclui:
- **Retry automático** com exponential backoff (2s, 4s, 8s)
- **Skip de status problemáticos** após 3 tentativas
- **Log detalhado** de todos os erros
- **Relatório final** com totais e erros

Se a API do Clint retornar erro 500 para um status (ex: WON), o sistema vai:
1. Tentar 3 vezes
2. Pular o status e continuar com os outros (OPEN, LOST)
3. Registrar o erro no relatório final

## Performance

| Operação | Tempo Estimado | Registros |
|----------|----------------|-----------|
| Contacts | ~30-60 min | ~134k |
| Deals | ~20-40 min | ~156k |
| Completo | ~50-100 min | ~290k |

**Dica:** Use `clint:sync:deals` após a primeira sincronização para economizar tempo!


