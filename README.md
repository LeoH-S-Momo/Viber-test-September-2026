# SeaPass

Plataforma de comercialização e gestão de cruzeiros temáticos (teste técnico — dev pleno).

- Backlog do produto: [`docs/product/BACKLOG.md`](docs/product/BACKLOG.md)
- Stack tecnológica e estrutura do monorepo: [`docs/architecture/stack-and-structure.md`](docs/architecture/stack-and-structure.md)
- Decisões de arquitetura: [`docs/architecture/decisions/`](docs/architecture/decisions/)

## Estrutura

Monorepo (`pnpm` workspaces + Turborepo):

- `apps/web` — frontend Next.js (site público, passageiro, organizador, admin)
- `apps/api` — backend NestJS (API REST + jobs assíncronos)
- `packages/contracts` — schemas Zod / contrato compartilhado entre `web` e `api`
- `packages/ui` — design system compartilhado
- `packages/config` — ESLint/Prettier/tsconfig compartilhados
- `infra/` — Docker Compose e Dockerfiles
- `docs/` — backlog, arquitetura e documentação de API

## Desenvolvimento local

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

docker compose -f infra/docker-compose.yml up -d
pnpm install
pnpm db:migrate && pnpm db:seed
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:3333
- Docs da API (Swagger): http://localhost:3333/docs

## Status

Fase atual: definição de backlog e arquitetura concluída. Implementação de features ainda não iniciada — ver `docs/product/BACKLOG.md` para o roadmap priorizado.
