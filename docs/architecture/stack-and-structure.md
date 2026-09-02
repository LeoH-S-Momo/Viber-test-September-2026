# SeaPass — Stack Tecnológica e Estrutura do Projeto

> Documento de referência arquitetural. Deve ser respeitado nas próximas etapas de implementação. Complementa [`docs/product/BACKLOG.md`](../product/BACKLOG.md).

Princípio geral: **tecnologia consolidada e madura, não a mais nova ou mais impressionante.** Para um teste técnico de nível pleno, o objetivo é demonstrar julgamento — saber quando uma ferramenta simples resolve, e quando uma mais robusta se paga. Por isso o backlog não usa microsserviços, Kafka, Kubernetes ou multi-banco: um monólito modular bem separado por domínio resolve o escopo do SeaPass com menos superfície de erro, e evolui para algo maior se um dia precisar.

---

## 1. Stack Tecnológica

### Frontend — **Next.js 15 (App Router) + TypeScript**

Uma única aplicação atende o site público, a área do passageiro, o painel do organizador e o painel admin, via *route groups* protegidos por RBAC (ver seção de estrutura). Motivos:
- **SSR/ISR nativos** importam para o catálogo público (SEO de páginas de cruzeiro/navio) sem exigir uma segunda stack de renderização.
- **Route Handlers** e **Server Actions** cobrem casos onde faz sentido evitar round-trip extra até a API (ex.: proxy autenticado).
- Ecossistema e comunidade maduros; contratação/revisão de código por outro dev pleno é direta.

*Alternativa considerada:* Vite + React SPA puro. Mais simples, mas perderia SSR/SEO no catálogo e exigiria resolver roteamento/autenticação por conta própria — trabalho que o Next.js já resolve. Descartada porque o catálogo público é central ao produto.

**Complementos:**
- **TailwindCSS** — estilização utilitária, evita CSS solto sem convenção.
- **Radix UI** (via `packages/ui`) — primitives acessíveis (modais, dropdowns) sem reescrever comportamento de acessibilidade do zero.
- **TanStack Query** — cache/estado de servidor (dados vindos da API), evita `useEffect` + `fetch` manual espalhado.
- **Zustand** — estado de cliente leve (ex.: carrinho de reserva em construção) onde Context API seria verboso.

### Backend — **NestJS (Node.js + TypeScript)**

- Estrutura modular por domínio (módulo/controller/service) nativa do framework — mapeia 1:1 com os módulos de negócio do backlog (`bookings`, `payments`, `tickets`, `organizers`...), sem precisar inventar uma convenção própria.
- Injeção de dependência facilita testar service isolado do controller (unit tests) e trocar implementações (ex.: `PaymentGateway` fake vs. real) sem tocar em regra de negócio.
- Decorators (`@nestjs/swagger`, guards, pipes) reduzem boilerplate de documentação e validação.

*Alternativa considerada:* Express ou Fastify "puro". Mais leve para uma API pequena, mas exigiria montar manualmente a organização modular, injeção de dependência e padronização de validação que o NestJS já entrega — nesse caso a "simplicidade" do Express vira mais código de convenção próprio para manter. Para o número de domínios do SeaPass (14 módulos), a estrutura do Nest se paga.

### Banco de Dados — **PostgreSQL**

O domínio é fortemente relacional (navio → deck → cabine; cruzeiro → itinerário → eventos; reserva → hóspedes → pagamento) com integridade referencial importante (não pode existir reserva de cabine que não existe, pagamento sem reserva, etc.). PostgreSQL é a escolha padrão de mercado para esse perfil: maduro, suporta bem transações, JSON quando necessário (ex.: metadados de evento) e não exige justificar por que não é um banco NoSQL.

### Cache — **Redis**

Dois usos concretos, não cache "porque sim":
1. **Hold temporário de cabine** durante o checkout (US-C4 do backlog) — `SETEX` com TTL curto é a ferramenta certa para "reservar por 10-15 min e expirar sozinho".
2. **Cache de leitura** do catálogo público (páginas de cruzeiro/navio, alto tráfego de leitura, baixa frequência de escrita).

### Filas / Mensageria — **BullMQ (sobre Redis)**

Necessário para: geração assíncrona do ingresso digital após aprovação do pagamento simulado, envio de notificações, e expiração do hold de cabine. BullMQ foi escolhido em vez de RabbitMQ/Kafka porque:
- Já usamos Redis (sem infraestrutura nova).
- O volume e a complexidade de mensageria do SeaPass não justificam um broker dedicado — BullMQ cobre retry, delay e jobs agendados, que é tudo que os fluxos do backlog exigem.
- Kafka/RabbitMQ entrariam em cena se houvesse múltiplos serviços consumindo os mesmos eventos de forma desacoplada — não é o caso de um monólito modular.

### Autenticação — **JWT (access + refresh) implementado com Passport.js**

Access token de vida curta (15 min) + refresh token de vida longa (7 dias) com rotação, senha com `bcrypt`, RBAC via guard (`RolesGuard` + decorator `@Roles('passenger' | 'organizer' | 'admin')`).

*Alternativa considerada:* provedor externo (Auth0/Clerk). Mais rápido de integrar e delega problemas de segurança a um terceiro — boa escolha em produção real com prazo apertado. Para um teste técnico de vaga pleno, porém, implementar auth próprio demonstra o conhecimento que a vaga avalia (hashing, expiração, refresh rotation, RBAC), então essa é a escolha padrão aqui; o provedor externo fica registrado como alternativa válida se o prazo do teste for curto.

### Validação — **Zod**

Usado nas duas pontas via `packages/contracts`: o mesmo schema Zod valida o body no backend (`ZodValidationPipe`) e tipa a chamada no frontend (`z.infer`), então o contrato de API vive em um único lugar em vez de duplicado (DTO do Nest de um lado, `interface` do frontend do outro).

*Alternativa considerada:* `class-validator` + `class-transformer` (padrão "de fábrica" do NestJS). Funciona bem só no backend, mas não é compartilhável com o frontend sem gerar código extra — perderíamos a vantagem de contrato único. Zod foi preferido por isso, mesmo custando um pouco de boilerplate a mais nos controllers do Nest (`ZodValidationPipe` customizado em vez do builtin).

### ORM — **Prisma**

Migrations declarativas, client 100% tipado (essencial trabalhando com TypeScript de ponta a ponta), e um schema único e legível (`schema.prisma`) que serve de documentação viva do modelo de dados descrito no backlog.

*Alternativa considerada:* TypeORM (mais idiomático em projetos NestJS "clássicos", decorators nas entities). Prisma foi preferido pela migration engine mais confiável e pelo DX de autocomplete/type-safety no client, considerados mais valiosos que a integração "nativa" via decorators do TypeORM.

### Documentação de API — **OpenAPI via `@nestjs/swagger`**

Gerada a partir dos decorators dos controllers/DTOs — não é escrita/mantida manualmente, então não fica desatualizada. Publicada em `/docs` na própria API em desenvolvimento e exportada para `docs/api/openapi.json` no build.

### Testes Unitários — **Jest** (backend) **+ Vitest** (frontend)

- Backend: **Jest** é o default do NestJS (gerado pelo próprio CLI), testando `service`/`controller` isolados via mocks de dependência.
- Frontend: **Vitest** (não Jest) porque compartilha configuração/transformação com o Vite/Next moderno, é mais rápido, e integra direto com **React Testing Library** para testar componentes pelo comportamento (não pela implementação).

### Testes de Integração — **Jest + Supertest**, contra Postgres/Redis reais em Docker

Sobem via `infra/docker-compose.test.yml` (efêmero, portas isoladas do ambiente de dev) e o teste bate na API real via HTTP (Supertest), validando o fluxo completo controller → service → Prisma → Postgres — não apenas a unidade isolada.

### Testes E2E — **Playwright**

Cobre os fluxos críticos ponta a ponta pelo browser real: descoberta → reserva → pagamento simulado → ingresso digital; CRUD do organizador; aprovação de organizador pelo admin. Preferido a Cypress por rodar múltiplos browsers nativamente, ser mais rápido em paralelo, e ter suporte de primeira classe a TypeScript e a fluxos de autenticação (storage state reutilizável entre testes).

### Containerização — **Docker + Docker Compose**

- `infra/docker-compose.yml` sobe a infraestrutura de desenvolvimento (Postgres, Redis, MinIO) — `web` e `api` rodam fora de container em dev para manter hot-reload rápido.
- `infra/docker-compose.test.yml` sobe infraestrutura efêmera para testes de integração/E2E (CI e local).
- `infra/docker/{api,web}.Dockerfile` — builds multi-stage de produção (deps → build → runtime), imagem final enxuta (`node:20-alpine`, sem devDependencies).
- Kubernetes fica deliberadamente fora do escopo v1 (ver backlog) — um container por app já é suficiente para o alvo de um teste técnico; `infra/k8s/` existe como placeholder documentando onde entraria se o projeto crescesse.

### CI/CD — **GitHub Actions**

Pipeline em `.github/workflows/ci.yml`: lint + typecheck + testes unitários (todo PR) → testes de integração → testes E2E → build de imagens Docker (só em `main`). Cada estágio depende do anterior passar (`needs:`), então falha rápido custa menos tempo de CI.

### Logs — **Pino**

Logger estruturado em JSON, com overhead mínimo de performance (relevante em uma API que processa webhooks de pagamento simulado e jobs de fila). Integra com NestJS via `nestjs-pino`. Preferido a Winston pela performance e por já produzir JSON estruturado por padrão, que é o formato que ferramentas de observabilidade esperam.

### Observabilidade — **OpenTelemetry (tracing) + Sentry (erros)**

- **Sentry** captura e agrupa exceções não tratadas em produção (frontend e backend), com contexto de request — retorno de investimento imediato mesmo em um projeto pequeno.
- **OpenTelemetry** instrumenta tracing distribuído básico (request → service → Prisma query), exportável para qualquer backend compatível (Grafana Tempo, Jaeger, etc.) sem lock-in de vendor. Tratado como camada opcional/documentada (variável de ambiente vazia por padrão) para não inflar a complexidade de rodar o projeto localmente — é o item mais "avançado" da lista e existe para mostrar que o design *permite* observabilidade de produção, sem forçar todo avaliador a subir um Grafana local para rodar o projeto.

### Storage — **S3-compatible (MinIO em dev, S3/R2 em produção)**

Necessário para imagens de navio/cabine/evento e, futuramente, anexos do ingresso digital. MinIO roda local via Docker Compose com a mesma API do S3, então o código de upload (`@aws-sdk/client-s3`) não muda entre dev e produção — só a variável de ambiente `STORAGE_ENDPOINT` muda.

---

## 2. Estrutura do Projeto — Monorepo

### Ferramentas de monorepo — **pnpm workspaces + Turborepo**

- **pnpm**: instala dependências compartilhadas uma única vez (menos disco, instala mais rápido que npm/yarn) e resolve workspaces (`workspace:*`) nativamente.
- **Turborepo**: cacheia e paraleliza `build`/`lint`/`test` entre os workspaces, e entende o grafo de dependência entre eles (`packages/contracts` builda antes de `apps/api` que depende dele).

*Alternativa considerada:* Nx. Mais recursos (geradores, graph visual), mas também mais conceitos para aprender e configurar — overkill para 2 apps + 3 packages. Turborepo cobre o necessário com uma curva de configuração bem menor.

### Por que um único app `web` (não `web` + `admin` separados)

As três áreas (passageiro, organizador, admin) compartilham grande parte da UI (autenticação, layout, componentes de formulário) e o mesmo domínio de dados. Separar em apps distintos duplicaria configuração (Next config, design system, auth) sem ganho real neste estágio — a separação por *route group* + guard de role dentro de uma única app já garante isolamento de acesso. Se um dia o painel admin precisar de um ciclo de deploy totalmente independente do site público, a extração para um app próprio é direta (o código já está separado por route group).

### Convenções de nomenclatura

| Item | Convenção | Exemplo |
|---|---|---|
| Pastas | `kebab-case` | `cruise-discovery/`, `booking-flow/` |
| Componentes React | `PascalCase.tsx` | `CabinCard.tsx` |
| Hooks | `camelCase` prefixado com `use` | `useCabinHold.ts` |
| Módulos/serviços NestJS | `kebab-case` + sufixo do tipo | `bookings.module.ts`, `bookings.service.ts` |
| Schemas Zod (contracts) | `PascalCase` + sufixo `Schema` | `CreateBookingSchema` |
| Tabelas no banco (via `@@map` do Prisma) | `snake_case`, plural | `bookings`, `cabin_categories` |
| Modelos Prisma | `PascalCase`, singular | `model Booking`, `model CabinCategory` |
| Rotas REST | `kebab-case`, plural, aninhadas por recurso pai | `/cruises/:id/cabins`, `/organizers/:id/cruises` |
| Variáveis de ambiente | `UPPER_SNAKE_CASE`, prefixo `NEXT_PUBLIC_` só quando exposta ao browser | `DATABASE_URL`, `NEXT_PUBLIC_API_URL` |
| Branches git | `tipo/descricao-curta` | `feat/booking-flow`, `fix/cabin-hold-ttl` |
| Commits | Conventional Commits | `feat(bookings): add cabin hold with TTL` |

### Gerenciamento de variáveis de ambiente

- Cada app tem seu próprio `.env.example` (`apps/api/.env.example`, `apps/web/.env.example`) documentando exatamente as variáveis que aquele processo usa — nunca um `.env` gigante compartilhado entre front e back.
- A raiz tem um `.env.example` próprio, mas só para variáveis lidas pelo `infra/docker-compose.yml` (credenciais de Postgres/Redis/MinIO em dev).
- `.env` real nunca é commitado (`.gitignore` cobre `.env*`, exceto os `.env.example`).
- Na API, as variáveis são validadas em runtime por um schema Zod em `src/config` — a aplicação recusa subir se algo obrigatório faltar ou estiver malformado, em vez de falhar silenciosamente mais tarde.
- Em produção, as variáveis são injetadas pela plataforma de deploy (ou pelo orquestrador de container), nunca lidas de um arquivo `.env` dentro da imagem.

### Configuração de desenvolvimento

1. `docker compose -f infra/docker-compose.yml up -d` — sobe Postgres, Redis e MinIO.
2. `pnpm install` na raiz — resolve todos os workspaces de uma vez.
3. `pnpm db:migrate && pnpm db:seed` — aplica migrations e popula dados de exemplo.
4. `pnpm dev` — Turborepo sobe `apps/web` (porta 3000) e `apps/api` (porta 3333) em paralelo, com hot-reload.

### Configuração de produção

- `apps/api` e `apps/web` são buildados como imagens Docker independentes (`infra/docker/*.Dockerfile`), publicadas pelo CI a partir de `main`.
- Migrations rodam como etapa de release (`prisma migrate deploy`) **antes** de a nova versão da API começar a receber tráfego — nunca via `migrate dev` em produção.
- Banco, cache e storage em produção são serviços gerenciados (ex.: RDS/Neon para Postgres, Upstash/Elasticache para Redis, S3/R2 para storage), não os containers de dev.
- Segredos (JWT secret, credenciais de banco/storage) vêm do gerenciador de segredos da plataforma de deploy, nunca de arquivo versionado.

---

## 3. Estrutura de Diretórios Completa

```
seapass/
├── .github/
│   └── workflows/
│       └── ci.yml                      # lint/typecheck/unit → integration → e2e → docker build
│
├── apps/
│   ├── web/                            # Next.js 15 — site publico + area do passageiro + paineis
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── (public)/           # catalogo, busca, pagina de cruzeiro/navio (SSR/ISR)
│   │   │   │   │   ├── cruzeiros/
│   │   │   │   │   └── navios/
│   │   │   │   ├── (auth)/             # login, registro
│   │   │   │   │   ├── login/
│   │   │   │   │   └── registro/
│   │   │   │   ├── (passenger)/        # requer role=passenger
│   │   │   │   │   ├── minha-conta/
│   │   │   │   │   ├── reservas/
│   │   │   │   │   └── ingressos/
│   │   │   │   ├── (organizer)/        # requer role=organizer
│   │   │   │   │   └── organizador/
│   │   │   │   ├── (admin)/            # requer role=admin
│   │   │   │   │   └── admin/
│   │   │   │   ├── layout.tsx
│   │   │   │   └── globals.css
│   │   │   ├── components/             # UI reutilizavel dentro da app
│   │   │   ├── features/               # organizacao por dominio de negocio
│   │   │   ├── hooks/                  # hooks compartilhados entre features
│   │   │   ├── lib/                    # http client, query client, formatters
│   │   │   ├── services/               # camada de acesso a API (@seapass/contracts)
│   │   │   ├── stores/                 # estado de cliente (Zustand)
│   │   │   ├── types/                  # tipos exclusivos do frontend
│   │   │   └── middleware.ts           # protecao de rota por role (RBAC)
│   │   ├── public/                     # assets estaticos
│   │   ├── tests/
│   │   │   ├── unit/                   # Vitest + Testing Library
│   │   │   └── e2e/                    # Playwright
│   │   ├── next.config.ts
│   │   ├── tailwind.config.ts
│   │   ├── tsconfig.json               # extends ../../tsconfig.base.json
│   │   ├── package.json
│   │   ├── .env.example
│   │   └── README.md
│   │
│   └── api/                            # NestJS — API REST + jobs assincronos
│       ├── src/
│       │   ├── modules/                # 1 modulo Nest por dominio de negocio
│       │   │   ├── auth/
│       │   │   ├── users/
│       │   │   ├── organizers/
│       │   │   ├── ships/
│       │   │   ├── cruises/
│       │   │   ├── cabins/
│       │   │   ├── itineraries/
│       │   │   ├── events/
│       │   │   ├── restaurants/
│       │   │   ├── bookings/
│       │   │   ├── payments/           # simulado — maquina de estados de pagamento
│       │   │   ├── tickets/            # geracao/validacao do ingresso digital (QR)
│       │   │   ├── notifications/
│       │   │   └── admin/
│       │   ├── common/                 # guards, decorators, filters, interceptors, pipes
│       │   │   ├── guards/
│       │   │   ├── decorators/
│       │   │   ├── filters/
│       │   │   ├── interceptors/
│       │   │   └── pipes/
│       │   ├── config/                 # env schema (Zod) + carregamento tipado
│       │   ├── database/
│       │   │   └── prisma/
│       │   │       ├── schema.prisma
│       │   │       ├── migrations/
│       │   │       └── seed.ts
│       │   ├── jobs/                   # processors BullMQ (fila sobre Redis)
│       │   ├── main.ts
│       │   └── app.module.ts
│       ├── test/
│       │   ├── unit/                   # Jest — service/controller isolados
│       │   └── integration/            # Jest + Supertest — contra Postgres/Redis reais
│       ├── tsconfig.json               # extends ../../tsconfig.base.json
│       ├── package.json
│       ├── .env.example
│       └── README.md
│
├── packages/
│   ├── contracts/                      # Zod schemas + tipos — contrato unico entre web e api
│   │   ├── src/
│   │   │   ├── booking/
│   │   │   ├── cruise/
│   │   │   ├── user/
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── README.md
│   ├── config/                         # ESLint / Prettier / tsconfig compartilhados
│   │   ├── eslint-preset.cjs
│   │   ├── prettier-preset.cjs
│   │   ├── package.json
│   │   └── README.md
│   └── ui/                             # design system compartilhado (Radix + Tailwind)
│       ├── src/
│       ├── package.json
│       └── README.md
│
├── infra/
│   ├── docker/
│   │   ├── api.Dockerfile              # multi-stage: deps → build → runtime (alpine)
│   │   └── web.Dockerfile              # multi-stage, output standalone do Next.js
│   ├── docker-compose.yml              # dev: postgres, redis, minio
│   ├── docker-compose.test.yml         # infra efemera para testes de integracao/E2E
│   └── k8s/                            # placeholder — fora de escopo v1
│       └── README.md
│
├── docs/
│   ├── product/
│   │   └── BACKLOG.md                  # epicos, historias de usuario, modelo de dados
│   ├── architecture/
│   │   ├── stack-and-structure.md      # este documento
│   │   ├── decisions/                  # ADRs
│   │   │   └── 0001-record-architecture-decisions.md
│   │   └── diagrams/
│   └── api/
│       └── README.md                   # openapi.json gerado em build
│
├── .editorconfig
├── .gitattributes
├── .gitignore
├── .nvmrc
├── .env.example                        # variaveis do docker-compose (raiz)
├── package.json                        # scripts raiz (turbo run ...)
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
└── README.md
```

### Grafo de dependência entre workspaces

```
apps/web  ──depends on──> packages/contracts, packages/ui, packages/config
apps/api  ──depends on──> packages/contracts, packages/config
```

Nenhum `package` depende de `apps/*` — a direção da dependência é sempre de app para package, nunca o inverso. `packages/contracts` não depende de nenhum outro workspace (é a base do grafo).
