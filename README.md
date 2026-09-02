# SeaPass

Plataforma de comercialização e gestão de cruzeiros temáticos (teste técnico — dev pleno).

- Backlog do produto: [`docs/product/BACKLOG.md`](docs/product/BACKLOG.md)
- Stack tecnológica e estrutura do monorepo: [`docs/architecture/stack-and-structure.md`](docs/architecture/stack-and-structure.md)
- Decisões de arquitetura: [`docs/architecture/decisions/`](docs/architecture/decisions/)
- Devlog (histórico do que foi feito e por quê): [`docs/DEVLOG.md`](docs/DEVLOG.md)

## Estrutura

Monorepo (`pnpm` workspaces + Turborepo):

- `apps/web` — frontend Next.js (site público, passageiro, organizador, admin)
- `apps/api` — backend NestJS (API REST + jobs assíncronos)
- `packages/contracts` — schemas Zod / contrato compartilhado entre `web` e `api`
- `packages/ui` — design system compartilhado (ainda vazio — só é populado quando o primeiro componente repetir entre features)
- `packages/config` — ESLint/Prettier compartilhados
- `infra/` — Docker Compose e Dockerfiles
- `docs/` — backlog, arquitetura e documentação de API

## Pré-requisitos

- Node.js 20+ (ver `.nvmrc`)
- [pnpm](https://pnpm.io) 9+ (ou use `corepack enable` / `npx pnpm@9`)
- Docker + Docker Compose (para Postgres, Redis e MinIO)

## Como rodar do zero (máquina limpa)

```bash
git clone <repo> seapass && cd seapass

# 1. Variaveis de ambiente
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# 2. Infraestrutura (Postgres, Redis, MinIO)
docker compose -f infra/docker-compose.yml up -d

# 3. Dependencias
pnpm install

# 4. Sobe web + api juntos (via Turborepo)
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:3333
- Health check da API: http://localhost:3333/health
- Docs da API (Swagger): http://localhost:3333/docs

A API sobe mesmo que Postgres/Redis ainda não estejam prontos — o processo não cai, apenas
`/health` reporta a dependência como indisponível (`503`) até o `docker compose up` terminar.

### Outros scripts úteis

```bash
pnpm build              # build de producao de todos os workspaces (via turbo)
pnpm lint                # eslint em todos os workspaces
pnpm typecheck            # tsc --noEmit em todos os workspaces
pnpm test                # testes unitarios (api: Jest, web: Vitest)
pnpm test:integration      # testes de integracao da api (Jest + Supertest) — requer
                            # infra/docker-compose.test.yml no ar
pnpm test:e2e             # testes end-to-end do web (Playwright) — requer
                            # `pnpm --filter @seapass/web exec playwright install` na 1a vez
```

### Notas de ambiente

- **Windows**: o repositório já vem configurado com `node-linker=hoisted` no `.npmrc`. Isso é
  necessário porque `next build` (modo `standalone`) tenta recriar symlinks ao copiar o
  `node_modules`, o que falha com `EPERM` no Windows sem privilégio elevado ou "Developer Mode"
  habilitado. Em Linux/macOS (incluindo os builds Docker e o CI) esse problema não existe.
- **Prisma**: o `schema.prisma` está configurado (datasource + generator) mas ainda **sem
  nenhum model** — o CLI do Prisma se recusa a gerar o client sem pelo menos um model. Por isso
  o health check do banco usa o driver `pg` puro por enquanto, e `db:migrate`/`db:seed` são
  no-ops até a modelagem de domínio ser adicionada (ver `docs/product/BACKLOG.md`).

## Status

Fase atual: bootstrap do monorepo concluído — frontend e backend sobem localmente, health check
e documentação de API funcionando, nenhuma funcionalidade de negócio implementada ainda. Ver
`docs/DEVLOG.md` para o histórico e `docs/product/BACKLOG.md` para o roadmap priorizado.
