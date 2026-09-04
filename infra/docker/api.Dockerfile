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

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/deploy/dist ./dist
COPY --from=build --chown=node:node /app/deploy/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/api/src/database/prisma ./prisma
# Nao roda como root dentro do container — `node` e o usuario nao-privilegiado ja embutido
# na imagem base node:alpine (uid 1000), nao precisa ser criado.
USER node
EXPOSE 3333
CMD ["node", "dist/main.js"]
