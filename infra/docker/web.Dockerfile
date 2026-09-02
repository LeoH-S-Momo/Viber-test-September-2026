# Build de producao do web (Next.js, output standalone). Contexto de build deve ser a
# raiz do monorepo: `docker build -f infra/docker/web.Dockerfile -t seapass-web .`
#
# O output standalone do Next.js faz tracing de arquivos (via @vercel/nft) e ja resolve
# as dependencias de workspace (@seapass/contracts) para arquivos reais dentro de
# .next/standalone — nao precisa de `pnpm deploy` como a api.

FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @seapass/contracts build
RUN pnpm --filter @seapass/web build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
