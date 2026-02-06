# Performance: Gargalo Atual e Estratégia de Snapshot Indexado

## Gargalo atual

O gargalo principal está em consultas com:

1. `ILIKE` (busca textual sem normalização prévia) 
2. `JOIN`s executados em runtime para compor dados e filtros

Na prática, isso causa:
- Alto custo de CPU para comparar texto de forma case-insensitive em grandes volumes.
- Baixa seletividade em filtros textuais quando não há estrutura adequada de indexação.
- Planos de execução instáveis sob variação de parâmetros.
- Aumento de latência por conta de múltiplas tabelas acessadas a cada requisição.

## Por que snapshot indexado resolve

A estratégia de snapshot indexado mitiga o problema deslocando trabalho pesado de leitura para uma etapa assíncrona de preparação:

- **Pré-computação**: campos normalizados e enriquecidos são gerados previamente.
- **Desnormalização controlada**: evita joins críticos na consulta de leitura.
- **Indexação dirigida ao padrão de busca**: índices sobre colunas já prontas para filtro/ordenação.
- **Consulta mais previsível**: menor variabilidade de plano e menos custo por request.

### Resultado esperado
- Queda de latência p95/p99 nas rotas de busca.
- Melhor throughput sob concorrência.
- Menor pressão de CPU no banco durante picos.
- Escalabilidade operacional melhor, já que o custo pesado migra para job batch incremental.

## Observação arquitetural

Os **forms** permanecem a camada canônica de entrada/modelagem de dados. O snapshot serve como estrutura derivada para leitura eficiente (read model), sem substituir a fonte de verdade.
