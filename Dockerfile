FROM node:20-alpine

# habilita corepack (pnpm oficial)
RUN corepack enable

WORKDIR /app

# copia apenas manifests
COPY package.json pnpm-lock.yaml ./

# instala dependências
RUN pnpm install --frozen-lockfile

# copia o resto do código
COPY . .

# gera client do prisma v2 durante o build
RUN pnpm prisma:generate

# build do NestJS
RUN pnpm build

ENV NODE_ENV=production
ENV PORT=3333

EXPOSE 3333

CMD ["sh", "-c", "pnpm prisma:migrate:deploy:v2 && if [ ! -f dist/src/main.js ]; then echo 'ERRO: artefato dist/src/main.js ausente.'; exit 1; fi && node dist/src/main.js"]
