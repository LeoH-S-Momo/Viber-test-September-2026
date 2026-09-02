# Build de producao da api (NestJS). Multi-stage para imagem final enxuta.
# Contexto de build deve ser a raiz do monorepo: `docker build -f infra/docker/api.Dockerfile .`

FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/config/package.json packages/config/package.json
RUN pnpm install --frozen-lockfile --filter @seapass/api...

FROM deps AS build
COPY . .
RUN pnpm --filter @seapass/api... build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/src/database/prisma ./prisma
COPY --from=build /app/node_modules ./node_modules
EXPOSE 3333
CMD ["node", "dist/main.js"]
