<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ pnpm install
```

## Compile and run the project

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Run tests

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ pnpm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

### Deploy com Docker (produção)

Antes de subir a API em produção, valide este checklist para evitar erro de boot por artefato ausente (`/app/dist/main.js`):

```bash
# 1) Renderizar config final do compose (com env resolvido)
docker compose --env-file ./.env config

# 2) Confirmar que o serviço da API NAO monta volume em /app
# (volumes em /app podem sobrescrever o build da imagem)

# 3) Build e subida
docker compose --env-file ./.env up -d --build

# 4) Verificar artefato compilado dentro do container
docker exec -it tetra-metrics-api sh -lc "ls -la /app/dist && test -f /app/dist/main.js"

# 5) Smoke test: migrations + start sem loop de restart
docker logs -f tetra-metrics-api
```

Esperado no log:
- `prisma migrate deploy` executa sem erro.
- O processo sobe com `pnpm start:prod`.
- Nao aparece `Cannot find module '/app/dist/main.js'`.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Desenvolvimento local

Para subir o PostgreSQL usado pelo Prisma em um ambiente de desenvolvimento, use o compose `docker-compose-dev.yaml`:

```bash
docker compose -f docker-compose-dev.yaml up -d db
```

O serviço `db` expõe a porta `6432` no host. Atualize o `DATABASE_URL` do seu `.env` ou crie um `.env.local` apontando para `postgresql://postgres:postgres@localhost:6432/postgres`.

Quando quiser popular o banco, execute o serviço `seed`, que já roda `pnpm prisma:seed` com a mesma conexão usada pelo app:

```bash
docker compose -f docker-compose-dev.yaml run --rm seed
```

O serviço de seed usa os artefatos da aplicação para garantir que o Prisma esteja atualizado. Ele só roda quando você chamá-lo manualmente e depende do serviço `db`.

## V2 (Prisma + PostgreSQL)

A V2 foi iniciada sem alterar o fluxo da V1 (Supabase), usando conexão dedicada via `DATABASE_URL_V2`.

### Modelagem inicial

- `Leads` mapeado para tabela `leads` com `@@map("leads")`
- `LeadIdentifiers` mapeado para tabela `lead_identifiers` com `@@map("lead_identifiers")`
- Todas as colunas usam `@map(...)` para manter nomes de desenvolvimento na aplicação
- `first_name` e `last_name` não existem na modelagem V2

### Migrações V2

```bash
pnpm prisma:generate
pnpm prisma:migrate:status:v2
pnpm prisma:migrate:deploy:v2
```

Para criar uma nova migration de desenvolvimento:

```bash
pnpm prisma:migrate:dev:v2 -- --name nome_da_migration
```

### Endpoint V2

Novo endpoint para importação incremental sem impactar a V1:

```text
POST /v2/leads/import-one
```

Payload mínimo:

```json
{
  "name": "Nome do Lead",
  "email": "lead@dominio.com",
  "phone": "5511999999999"
}
```

Regra atual: deduplica por email (preferencial) e usa telefone em best-effort.

## Pipeline de testes com Jest + SWC

- O Jest continua sendo o runner completo, agora com `@swc/jest` como transformer para transpilar `*.ts` rapidamente antes da execução.
- A configuração no `package.json` habilita `decorators`, `decoratorMetadata` e `legacyDecorator`, mantendo compatibilidade com NestJS.
- Coverage, mocks e moduleNameMapper seguem inalterados; apenas o transformer mudou.
- Como o SWC não faz type-check, rodamos `pnpm tsc --noEmit` em paralelo (local ou CI) para garantir integridade de tipos.
- Métrica observada nos testes unitários da base NestJS/ERP:
  - `pnpm test` (antes, com `ts-jest`): ~6,6 s
  - `pnpm test` (agora, com `@swc/jest`): ~1,3 s
    Esses ganhos reduzem o ciclo de feedback e liberam capacidade na CI sem sacrificar a qualidade (desde que o `tsc --noEmit` continue rodando como gate de tipos).

### Scripts úteis

- `pnpm test` / `pnpm test:swc`: usa `@swc/jest` (configuração padrão no `package.json`) e é a escolha recomendada para a rotina diária / CI rápida.
- `pnpm test:ts-jest`: executa a mesma bateria com `ts-jest`, útil para comparar contra o comportamento legado ou diagnosticar problemas que aparecem somente com o compilador oficial do TypeScript.
- `pnpm check:types`: roda `tsc --noEmit` explicitamente (é esse comando que garante verificação de tipos, já que o SWC só transpila sem checar).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
