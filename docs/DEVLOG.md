# SeaPass — Devlog

> Registro cronológico do que foi feito no projeto: decisões, entregas e o raciocínio por trás delas. Complementa (sem substituir) [`docs/product/BACKLOG.md`](product/BACKLOG.md) e [`docs/architecture/stack-and-structure.md`](architecture/stack-and-structure.md) — este arquivo é atualizado a cada etapa relevante da colaboração.

---

## 2026-09-02 — Backlog inicial do produto

**O quê:** definido o backlog completo do SeaPass (plataforma de comercialização e gestão de cruzeiros temáticos) em [`docs/product/BACKLOG.md`](product/BACKLOG.md).

**Conteúdo:**
- Visão geral e 5 personas (passageiro guest/cliente, organizador, operador do organizador, admin global).
- 13 módulos/domínios mapeados (catálogo, inventário do navio, itinerário/eventos, restaurantes, reservas, pagamento simulado, ingresso digital, acompanhamento de viagem, conta, painel do organizador, painel admin global, auth, notificações).
- 10 épicos com ~45 histórias de usuário no formato "Como [persona], quero [ação], para [benefício]".
- Modelo de dados de alto nível (entidades e relações) e pontos de atenção de modelagem (máquina de estados da reserva, hold de cabine, multi-tenancy lógica).
- Requisitos não funcionais, itens fora de escopo (v1) e priorização MoSCoW.

**Por quê:** ponto de partida único e por escrito antes de qualquer decisão técnica, para que stack e arquitetura sejam escolhidas em função do escopo real, não do contrário.

---

## 2026-09-02 — Stack tecnológica e estrutura do monorepo

**O quê:** definida e justificada a stack completa em [`docs/architecture/stack-and-structure.md`](architecture/stack-and-structure.md):

Next.js 15 (frontend único com route groups por perfil) · NestJS (backend modular) · PostgreSQL · Prisma · Redis + BullMQ (hold de cabine, filas) · JWT/Passport (auth própria) · Zod (validação compartilhada via `packages/contracts`) · OpenAPI/Swagger · Jest+Vitest (unitário) · Jest+Supertest (integração) · Playwright (E2E) · Docker/Docker Compose · GitHub Actions · Pino (logs) · OpenTelemetry+Sentry (observabilidade) · S3-compatible/MinIO (storage).

Cada escolha documentada com a alternativa considerada e o motivo de ter sido descartada (ex.: Auth0/Clerk vs. JWT próprio; TypeORM vs. Prisma; Nx vs. Turborepo).

**Estrutura definida:** monorepo `pnpm workspaces + Turborepo` com `apps/web`, `apps/api`, `packages/{contracts,ui,config}`, `infra/`, `docs/`. Convenções de nomenclatura, gestão de variáveis de ambiente (um `.env.example` por app, validação via Zod em runtime na API) e configuração de dev/produção documentadas.

**Scaffolding materializado no repositório (commit `b50b1da`):**
- Árvore completa de diretórios (route groups do Next, 14 módulos NestJS, 3 packages, infra, docs), cada pasta com `README.md` de responsabilidade ou `.gitkeep`.
- `package.json` por workspace (metadados/scripts, sem dependências instaladas ainda).
- `infra/docker-compose.yml` (dev), `infra/docker-compose.test.yml` (testes), Dockerfiles multi-stage de produção para `api` e `web`.
- `.github/workflows/ci.yml` (lint/typecheck/unit → integration → e2e → docker build).
- `.env.example` na raiz e por app; `tsconfig.base.json`, `turbo.json`, `pnpm-workspace.yaml`, `.gitignore`, `.editorconfig`, `.nvmrc`.
- Primeiro ADR (`docs/architecture/decisions/0001-record-architecture-decisions.md`) formalizando a prática de registrar decisões de arquitetura.
- `BACKLOG.md` movido de `/` para `docs/product/`.

**Por quê:** nível pleno se demonstra tanto pela escolha certa quanto por saber justificar o que *não* foi escolhido (Kafka, Kubernetes, microsserviços) — o documento existe para deixar esse raciocínio auditável, e a estrutura foi materializada em disco desde já para ser respeitada (não redefinida) nas próximas etapas de implementação.

**Nenhum código de feature foi escrito nesta etapa** — apenas configuração, documentação e esqueleto de diretórios.

---

## 2026-09-02 — Devlog

**O quê:** criado este arquivo (`docs/DEVLOG.md`) para manter um registro contínuo, em linguagem simples, de tudo que vai sendo feito no projeto — decisões, entregas e o porquê — à medida que a colaboração avança.

**Por quê:** o backlog e os documentos de arquitetura descrevem o *estado atual* das decisões; este devlog preserva o *histórico* de como se chegou até ali, o que facilita retomar o contexto em conversas futuras e serve de trilha de auditoria informal do processo.

---

<!-- Novas entradas são adicionadas ao final, em ordem cronológica, cada uma com data, "O quê" e "Por quê". -->
