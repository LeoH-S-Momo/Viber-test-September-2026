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
# O server.js do output "standalone" escuta em "localhost" por padrao — sem isso, o
# mapeamento de porta do Docker (-p 3000:3000) nao alcancaria a app de fora do container.
ENV HOSTNAME="0.0.0.0"
ENV PORT=3000
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
# Nao roda como root dentro do container — `node` e o usuario nao-privilegiado ja embutido
# na imagem base node:alpine (uid 1000), nao precisa ser criado.
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=5 \
  CMD node -e "require('http').get('http://localhost:3000', (res) => process.exit(res.statusCode < 500 ? 0 : 1)).on('error', () => process.exit(1))"
CMD ["node", "apps/web/server.js"]
