# Build de producao da api (NestJS). Contexto de build deve ser a raiz do monorepo:
# `docker build -f infra/docker/api.Dockerfile -t seapass-api .`
#
# Usa `pnpm deploy` (mecanismo oficial do pnpm para monorepos) para produzir uma pasta
# self-contained da api com as dependencias de workspace (@seapass/contracts) resolvidas
# como arquivos reais, evitando o problema classico de symlinks de workspace quebrados
# ao copiar apenas parte do node_modules entre estagios do Docker.

FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @seapass/contracts build
RUN pnpm --filter @seapass/api build
RUN pnpm --filter @seapass/api deploy --prod /app/deploy
# `pnpm deploy` roda o postinstall (prisma generate) durante o proprio empacotamento, mas nao
# preserva o resultado na pasta final — o Prisma Client gerado (node_modules/.prisma/client)
# some da pasta /app/deploy, mesmo o log do passo acima reportando sucesso (limitacao conhecida
# do `pnpm deploy`, reproduzida e confirmada localmente antes desta correcao). Sem esta linha, o
# container sobe e cai na hora com "Cannot find module '.prisma/client/default'". Gerar de novo
# AQUI, depois do deploy, contra a pasta ja empacotada, e o que garante que o cliente sobrevive.
RUN cd /app/deploy && node_modules/.bin/prisma generate --schema src/database/prisma/schema.prisma

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/deploy/dist ./dist
COPY --from=build --chown=node:node /app/deploy/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/api/src/database/prisma ./prisma
# Nao roda como root dentro do container — `node` e o usuario nao-privilegiado ja embutido
# na imagem base node:alpine (uid 1000), nao precisa ser criado.
USER node
EXPOSE 3333
# `node -e` em vez de curl/wget — alpine nao garante nenhum dos dois, mas node esta
# garantidamente presente (e a propria imagem). Bate no health check real da API (Postgres +
# Redis), nao so "o processo esta de pe".
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=5 \
  CMD node -e "require('http').get('http://localhost:3333/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"
CMD ["node", "dist/main.js"]
