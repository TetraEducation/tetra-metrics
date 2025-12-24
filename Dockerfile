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

# build do NestJS
RUN pnpm build

ENV NODE_ENV=production
ENV PORT=3333

EXPOSE 3333

CMD ["node", "dist/main.js"]
