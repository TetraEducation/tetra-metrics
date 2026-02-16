# Aula executiva: por que banco de dados e otimizações sao indispensaveis no `tetra-metrics`

## Introducao executiva

Esta nota tecnica tem um objetivo simples: explicar, de forma formal e objetiva, por que uma operacao de dados de leads em crescimento nao pode depender apenas de planilhas, mesmo com Power Query e IA.

No contexto do `tetra-metrics`, o desafio real nao e "gerar um CSV". O desafio real e:

- manter **consistencia dos dados** ao longo do tempo;
- sustentar **escala de volume** sem degradar desempenho;
- garantir **confiabilidade de consulta** para operacao e decisao;
- oferecer **rastreabilidade e governanca** para auditoria e qualidade.

Planilhas sao excelentes para consumo e analise pontual. Nao sao, por arquitetura, o melhor mecanismo para ser fonte primaria transacional de um dominio com alta variabilidade e crescimento continuo.

## Aula 1 - Diferenca de paradigma: banco relacional vs planilha

### 1.1 O que um banco relacional oferece por projeto

Um banco relacional (como PostgreSQL via Prisma no projeto) existe para garantir propriedades que planilhas nao garantem com o mesmo rigor:

1. **Integridade referencial**: relacionamento consistente entre entidades.
2. **Restricoes e unicidade**: prevencao de duplicidade por chave.
3. **Concorrencia segura**: multiplos processos/usuarios atuando sem corromper estado.
4. **Consultas otimizaveis**: indices e planos de execucao.
5. **Governanca do dado**: trilha, padrao e reproducibilidade.

### 1.2 O que uma planilha oferece (e o que nao oferece)

Excel e Power Query sao excelentes para:

- modelagem analitica local;
- consolidacao de visoes gerenciais;
- transformacao de dados ja extraidos.

Mas planilhas, como fonte primaria, apresentam limites tecnicos conhecidos:

- dificuldade de impor chaves e relacionamentos fortes;
- maior risco de divergencia entre versoes de arquivo;
- baixa robustez para alta concorrencia operacional;
- degradacao de desempenho com crescimento de volume;
- dependencia de processo manual para garantir qualidade.

Conclusao da Aula 1: planilha e camada de analise; banco relacional e camada de verdade operacional.

## Aula 2 - Modelagem correta para leads: por que normalizacao e necessaria

No `tetra-metrics`, o dado de formularios e respostas cresce por natureza. Cada lead pode ter multiplas submissoes e cada submissao pode ter multiplas respostas.

A modelagem relacional separa responsabilidades:

- `FormSubmissions`: submissao, referencia de origem e `dedupe_key`;
- `FormAnswers`: respostas tipadas por pergunta;
- `FormQuestions` e `FormSchemas`: estrutura dinamica de perguntas e formularios;
- `Leads`, `LeadIdentifiers`, `LeadSources`, `LeadTags`: entidade principal e seus vinculos;
- `LeadSearchProfile`: projecao otimizada para leitura.

Essa separacao nao e burocracia; e o que viabiliza:

- deduplicacao consistente;
- evolucao de campos sem quebrar historico;
- consultas compostas sem perda de semantica;
- trilha de origem e confiabilidade de resultado.

## Aula 3 - Otimizacao de leitura: indices, filtros e snapshot

O documento interno de performance registra o gargalo classico de ambientes de dados em escala:

- consultas com `ILIKE` em alto volume;
- muitos `JOIN` em runtime para montar filtro e resposta;
- variabilidade de plano e aumento de latencia.

A resposta arquitetural adotada e correta do ponto de vista de engenharia:

1. manter forms como camada canonica;
2. gerar snapshot/read model derivado para leitura;
3. indexar atributos de filtro frequente;
4. deslocar custo pesado para job assincorno.

No `prisma/schema.prisma`, `LeadSearchProfile` mostra essa estrategia com campos normalizados e varios indices direcionados (faixas salariais, idade, genero, empresa, escolaridade, cargo e correlatos). Isso reduz custo de leitura recorrente e aumenta previsibilidade operacional.

## Aula 4 - Processamento assincorno: por que jobs existem

Em operacao real, importacao, normalizacao e exportacao precisam de:

- processamento em lote;
- checkpoint e retomada;
- idempotencia;
- retry controlado;
- observabilidade de progresso e falha.

Esse padrao esta implementado no projeto:

- exportacao v2 enfileirada com resposta `202` e `operationId`;
- processamento em batches no servico de exportacao;
- atualizacao de progresso ao longo da execucao;
- retencao e limpeza automatica de arquivos exportados.

Sem esse desenho, a operacao fica vulneravel a timeout, bloqueio de request, travamentos e baixa previsibilidade de SLA.

## Aula 5 - Onde Excel e Power Query entram corretamente

Excel e Power Query agregam valor quando usados na etapa certa:

1. o backend consolida e normaliza;
2. a exportacao entrega um snapshot confiavel;
3. o analista usa Power Query para modelagem e visualizacao.

Esse fluxo respeita o papel de cada tecnologia:

- **`tetra-metrics`**: qualidade, integridade, governanca e escala;
- **Excel/Power Query**: analise, exploracao e apresentacao.

Quando se inverte essa ordem (planilha como fonte primaria), o custo oculto cresce: retrabalho, inconsistencias, divergencia de versoes e decisoes menos confiaveis.

## Aula 6 - IA: o que ela faz bem e o que ela nao substitui

IA e multiplicadora de valor quando a base de dados esta bem estruturada. Ela nao substitui, por si so:

- modelagem de entidade e relacionamento;
- qualidade de chave e deduplicacao;
- consistencia temporal e historico;
- governanca e rastreabilidade de dado.

Em termos tecnicos: IA nao corrige automaticamente problema de arquitetura de dados.  
Se a entrada e fragmentada, duplicada ou sem padrao, a IA apenas acelera inferencias inconsistentes.

Por outro lado, com `tetra-metrics` consolidando a fonte da verdade:

- consultas ficam semanticamente coerentes;
- segmentacoes ficam reproduziveis;
- exportacoes ficam confiaveis;
- modelos de IA operam com contexto mais limpo e util.

## Estudo de caso: aplicacao direta no `tetra-metrics`

As decisoes tecnicas do projeto refletem boas praticas de engenharia de dados:

- **Modelo relacional tipado** para formularios e respostas (`FormSubmissions`, `FormAnswers`, `FormQuestions`, `FormSchemas`).
- **Restricoes e indices** para consistencia e desempenho (`UNIQUE`, `INDEX`, relacoes entre entidades).
- **Read model indexado** em `LeadSearchProfile` para reduzir custo de leitura.
- **Jobs assincornos** para normalizacao e exportacao, com progresso e controle operacional.
- **API de exportacao assincorna** (`202 Accepted`) para suportar carga sem sacrificar estabilidade.

Esses elementos nao sao "complexidade desnecessaria". Sao os mecanismos que tornam a operacao robusta conforme o volume cresce.

## Objeções frequentes (Q&A)

### "Se o objetivo e ver dado, por que nao deixar tudo em Excel?"

Porque ver dado e diferente de governar dado.  
Excel resolve visualizacao; banco resolve consistencia, integridade, escala e operacao multiusuario.

### "Power Query nao poderia substituir esse backend?"

Nao. Power Query e camada de transformacao/consumo. Ele depende de uma fonte confiavel e nao substitui o nucleo transacional com dedupe, constraints, job control e observabilidade.

### "IA nao organiza tudo isso automaticamente?"

Nao com garantia operacional. IA apoia classificacao e analise, mas precisa de base consolidada e semantica confiavel. Sem isso, aumenta ruido em vez de reduzir risco.

## Conclusao para lideranca

A discussao correta nao e "Excel vs banco" como preferencia de ferramenta.  
A discussao correta e **arquitetura de dados adequada ao nivel de escala e confiabilidade exigido pelo negocio**.

Recomendacao objetiva:

1. manter `tetra-metrics` como fonte primaria de verdade;
2. manter jobs de normalizacao e exportacao como pilares de desempenho;
3. usar Excel/Power Query na camada analitica pos-export;
4. aplicar IA sobre dados consolidados, nao sobre base fragmentada.

Esse arranjo reduz risco operacional, aumenta confiabilidade de decisao e sustenta crescimento sem perda de qualidade.

## Referencias tecnicas internas

- `prisma/schema.prisma`
- `docs/performance.md`
- `docs/normalization-job.md`
- `src/modules/leads-v2/interface/http/leads-v2.controller.ts`
- `src/modules/leads-v2/application/services/leads-v2-export.service.ts`
- `src/modules/leads-v2/application/services/leads-v2-export-jobs.service.ts`
- `src/modules/leads-v2/application/services/leads-v2-export-jobs.scheduler.ts`
- `src/modules/leads-v2/application/services/leads-v2-normalize-search-profile-jobs.service.ts`
- `src/modules/leads-v2/application/services/leads-v2-prisma-listing-query.helper.ts`
- `src/modules/leads/application/dto/leads-listing.dto.ts`
# Justificativa técnica e de negócio: por que o `tetra-metrics` não pode ser substituído por Excel + Power Query

## Contexto executivo

O ponto central não é "preferência por tecnologia", e sim **escala, confiabilidade e tempo de resposta**.  
Com o crescimento da operação, o volume de respostas por lead aumenta continuamente, e isso torna inviável tratar o dado bruto como se fosse apenas uma planilha.

Em resumo:

- Excel e Power Query são excelentes para **análise e apresentação**.
- O `tetra-metrics` existe para **consolidar, normalizar, governar e servir o dado correto**.
- Sem essa base, exportação, busca e segmentação ficam lentas, inconsistentes e caras de manter.

## Por que esse dado cresce naturalmente

No domínio de leads, cada lead pode gerar:

- múltiplas submissões;
- múltiplas respostas por submissão;
- atualizações ao longo do tempo;
- novos campos/perguntas conforme campanhas e formulários evoluem.

Isso aumenta cardinalidade por design.  
Não é "erro de modelagem": é comportamento esperado de produto real.

## Por que banco relacional (e não planilha) é necessário

O modelo atual separa responsabilidades de dados de forma explícita:

- `FormSubmissions` guarda submissões e vínculo com lead;
- `FormAnswers` guarda respostas em estrutura tipada (`value_text`, `value_number`, `value_bool`, `value_json`);
- `LeadSearchProfile` mantém snapshot otimizado para consulta com índices;
- `LeadIdentifiers`, `LeadSources`, `LeadTags` e eventos preservam deduplicação, origem e rastreabilidade.

Essa modelagem permite coisas que planilha não garante bem:

1. **Integridade referencial**: relações entre tabelas e consistência de dados.
2. **Deduplicação confiável**: chaves únicas e regras por identificador.
3. **Consultas escaláveis**: índices para filtros combinados (salário, idade, gênero, cargo etc.).
4. **Auditoria e histórico**: trilha de origem, atualização e processamento.
5. **Resiliência operacional**: processamento incremental e idempotente.

## Por que normalizar em jobs é regra de escala

Os próprios documentos técnicos do projeto registram o gargalo:

- custo alto de `ILIKE` e `JOIN` em runtime para leitura;
- variabilidade de plano de execução e aumento de latência;
- necessidade de deslocar trabalho pesado para etapa assíncrona.

Por isso o `tetra-metrics` usa job de normalização/snapshot:

- mantém forms como camada canônica (fonte de verdade);
- cria projeção derivada para leitura rápida;
- processa em lotes com checkpoint/cursor e retomada segura;
- evita recomputar tudo a cada requisição.

Sem isso, exportações e listagens em alta escala degradam rapidamente.

## Por que exportação assíncrona existe (e é correta)

No fluxo v2, exportação é operação assíncrona (`202 Accepted`) com `operationId`:

- enfileira job de exportação;
- processa em lotes (`batch`) para não travar request;
- atualiza progresso;
- gera CSV consolidado;
- expira e limpa arquivos automaticamente (retenção de 3 dias).

Isso resolve volume real com previsibilidade operacional.  
Uma abordagem síncrona em planilha não oferece o mesmo controle de status, retry, retenção e observabilidade.

## Limites práticos de Excel + Power Query como fonte primária

Excel/Power Query são ferramentas fortes, mas têm limitações estruturais para este cenário:

- limite de escala e degradação com arquivos grandes;
- dependência de snapshots locais (dado envelhece rápido);
- risco maior de divergência entre versões de arquivo;
- falta de governança transacional e integridade relacional nativa;
- dificuldade para manter dedupe e regras complexas de negócio com consistência.

Em outras palavras: funcionam bem para consumir dado já consolidado, não para ser a camada central de verdade.

## Onde Power Query entra muito bem

O encaixe correto é **depois** da consolidação do `tetra-metrics`:

1. backend consolida, normaliza e exporta com filtros consistentes;
2. usuário baixa CSV confiável da operação concluída;
3. Power Query transforma, agrega e monta visões gerenciais.

Assim, cada camada faz o que faz melhor:

- `tetra-metrics`: qualidade, consistência, escalabilidade e governança;
- Excel/Power Query: consumo analítico e visualização.

## Por que IA sozinha não resolve esse problema

Ferramentas de IA (incluindo ChatGPT/OpenAI e similares) **não substituem engenharia de dados**.  
IA não corrige automaticamente:

- dado duplicado/inconsistente na origem;
- ausência de chave única e relacionamento confiável;
- falta de histórico e semântica de campos;
- divergência entre múltiplas planilhas/snapshots.

IA sobre dado desorganizado apenas acelera resposta ruim ("garbage in, garbage out").

## Como o `tetra-metrics` melhora o uso de IA

Quando o `tetra-metrics` consolida e normaliza a base:

- existe uma fonte única de verdade;
- filtros e atributos ficam consistentes;
- segmentações viram consultas confiáveis;
- exportações são reproduzíveis;
- a IA passa a operar sobre dado governado.

Resultado: mais precisão, menos alucinação por ambiguidade de dados e maior confiança para decisões.

## Perguntas objetivas (Q&A)

### "Power Query não resolve sozinho?"

Não. Ele resolve bem a camada analítica pós-export, mas não substitui deduplicação, integridade, jobs de normalização, controle de execução e governança de uma base relacional.

### "ChatGPT/OpenAI não conseguiria organizar isso diretamente?"

Não com garantia de consistência operacional. IA pode apoiar classificação, resumo e análise, mas precisa de base consolidada e regras de negócio já estruturadas.

### "Então por que não deixar tudo no Excel?"

Porque o custo oculto cresce com o volume: retrabalho, inconsistência entre arquivos, lentidão e perda de confiabilidade nas decisões. O backend reduz esse custo estrutural.

## Recomendação final

Manter a arquitetura atual do `tetra-metrics` como fonte da verdade é a decisão correta para escala e confiabilidade.  
Excel + Power Query devem permanecer como camada de consumo analítico sobre exportações consolidadas.  
E IA deve ser aplicada em cima dessa base governada para gerar resultado realmente útil.

## Referências técnicas internas (código e docs)

- `prisma/schema.prisma`
- `docs/performance.md`
- `docs/normalization-job.md`
- `src/modules/leads-v2/interface/http/leads-v2.controller.ts`
- `src/modules/leads-v2/application/services/leads-v2-export.service.ts`
- `src/modules/leads-v2/application/services/leads-v2-export-jobs.service.ts`
- `src/modules/leads-v2/application/services/leads-v2-export-jobs.scheduler.ts`
- `src/modules/leads-v2/application/services/leads-v2-normalize-search-profile-jobs.service.ts`
- `src/modules/leads-v2/application/services/leads-v2-prisma-listing-query.helper.ts`
- `src/modules/leads/application/dto/leads-listing.dto.ts`
