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

## 2026-09-02 — Bootstrap completo (monorepo, frontend, backend, infra)

**O quê:** implementado e **testado de ponta a ponta** o bootstrap do SeaPass, sem nenhuma
funcionalidade de negócio:

- `packages/config` — presets reais de ESLint (flat config) e Prettier.
- `packages/contracts` — buildado com `tsup` (cjs+esm+dts); primeiro schema real
  (`HealthStatusSchema`), consumido por `apps/web` e usado para tipar a resposta do health check.
- `apps/api` (NestJS) — `main.ts`, `app.module.ts`, `ConfigModule` com validação de env via Zod
  (`src/config/env.schema.ts`), `nestjs-pino` para logs estruturados, `RedisService` (ioredis)
  resiliente a falha de conexão, `GET /health` (`@nestjs/terminus`) checando Postgres (via `pg`)
  e Redis, Swagger em `/docs`, testes unitário e de integração do health check.
- `apps/web` (Next.js 15 + Tailwind v4) — layout raiz, página inicial em `(public)/page.tsx`
  mostrando o status da API em tempo real (`ApiStatus`, client component com fetch para
  `/health`), testes unitários (Vitest + Testing Library) e config de E2E (Playwright).
- Docker: `infra/docker/api.Dockerfile` usa `pnpm deploy` (mecanismo oficial do pnpm para
  monorepos) para gerar uma pasta self-contained; `web.Dockerfile` usa o output `standalone` do
  Next.js. Ambos ajustados depois de identificar que copiar apenas parte do `node_modules`
  simlinkado do pnpm entre estágios do Docker quebra a resolução de dependências.
- `.env`/`.env.local` locais criados a partir dos `.env.example` para testar o boot de verdade.

**Testado de verdade (não apenas escrito):** `pnpm install`, `pnpm lint`, `pnpm typecheck`,
`pnpm build` e `pnpm test` rodando limpos nos 3 workspaces com código (api, web, contracts) via
Turborepo; API buildada e iniciada como processo real (`node dist/main.js`); frontend rodando em
modo dev real (`next dev`); `pnpm dev` na raiz subindo os dois juntos; `GET /health` retornando
`503` com o motivo de cada dependência indisponível quando Postgres/Redis não estão no ar (sem
derrubar o processo) e `200` no `/docs` (Swagger).

**Duas decisões técnicas corrigidas durante a implementação (documentadas como ADR):**

1. **Prisma recusa gerar client com zero models** ([ADR-0002](architecture/decisions/0002-database-health-check-without-prisma-model.md)) —
   descoberto ao tentar rodar `prisma generate` com o `schema.prisma` vazio (só
   datasource+generator, sem nenhum model, já que nenhuma funcionalidade de negócio foi
   implementada). Não era uma decisão arquitetural anterior, mas um detalhe de implementação
   deste bootstrap que se provou inviável. Correção: o health check do banco usa o driver `pg`
   puro por enquanto; `PrismaService` será adicionado junto com o primeiro model de domínio.
2. **`next build` (standalone) falha no Windows sem symlink** ([ADR-0003](architecture/decisions/0003-pnpm-hoisted-node-linker-on-windows.md)) —
   `EPERM` ao tentar recriar symlinks do `node_modules` do pnpm. Correção: `.npmrc` com
   `node-linker=hoisted` na raiz. Não afeta `pnpm dev`, builds Docker (Linux) nem o CI (Ubuntu).

**Por quê:** o pedido explícito era "quero que frontend e backend consigam subir localmente" —
por isso cada peça foi validada rodando de verdade (instalação, lint, typecheck, build, testes,
boot dos processos, chamada HTTP real), não apenas escrita. Os dois problemas acima só apareceram
ao testar de verdade, o que reforça por que essa validação foi feita antes de reportar a tarefa
como concluída.

## 2026-09-02 — Revisão de bugs e reforço de testes no bootstrap

**O quê:** revisão linha a linha de todo o código do bootstrap em busca de bugs reais, com
testes de verdade (não só leitura) sempre que possível. Achados e correções:

- **`pg.Pool` sem listener de erro** (`database.health-indicator.ts`): pool do Postgres não
  tinha `.on('error', ...)`. Uma conexão ociosa que falhasse em background (ex: Postgres
  reiniciando) derrubaria o processo Node inteiro — exatamente o crash que o health check deveria
  evitar. Corrigido, com teste unitário novo confirmando que o listener é registrado.
- **`ApiStatus` mostrava "conectada" em verde mesmo com `status: "error"`**: qualquer resposta
  HTTP bem-sucedida do `/health` era tratada como saudável, mesmo quando o payload dizia que
  banco/Redis estavam fora do ar — justamente o cenário mais comum em dev local sem Docker.
  Corrigido para diferenciar "conectada e saudável" (verde) de "conectada mas degradada" (âmbar),
  com teste cobrindo o novo caso.
- **`node_modules` local vazando para dentro das imagens Docker**: não existia `.dockerignore`.
  `COPY . .` nos Dockerfiles copiaria o `node_modules` do Windows (binários nativos incompatíveis
  com o container Linux), `.git/`, `.env` (segredos) e build artifacts para o contexto de build.
  Criado `.dockerignore` na raiz.
- **Web Docker: servidor bindava só em `localhost`**: o `server.js` gerado pelo output
  `standalone` do Next.js escuta em `localhost` por padrão — o mapeamento de porta do Docker
  (`-p 3000:3000`) não alcançaria a app de fora do container. Corrigido com
  `ENV HOSTNAME="0.0.0.0"` no `web.Dockerfile` (gotcha documentado do próprio Next.js).
- **`turbo run build typecheck` em paralelo quebrava com corrida real**: reproduzido de propósito
  — `next build` apaga/regera `.next/types` enquanto `tsc --noEmit` tentava ler os mesmos
  arquivos (`TS6053: File not found`). Descoberto também que o `next build` **reescreve sozinho**
  o `tsconfig.json` para readicionar esse include — corrigir removendo a entrada não seria
  durável. Corrigido com um `tsconfig.typecheck.json` separado, dedicado ao script `typecheck`,
  que nunca toca em `.next`. Confirmado reproduzindo a corrida 3x depois da correção (sem falha).
- **Vitest sem cleanup do DOM entre testes**: sem `test.globals: true`, o Testing Library não
  registra cleanup automático — DOM de um teste vazava para o próximo (`getByText` encontrava
  múltiplos elementos). Corrigido com `cleanup()` explícito em `afterEach` no `setup.ts`.
- **CI: job de E2E nunca subia o servidor web**: buildava o app mas nunca rodava `next start`
  antes do Playwright tentar acessá-lo. Corrigido com `webServer` no `playwright.config.ts`
  (reaproveita um `pnpm dev` já rodando localmente; sempre sobe fresco no CI).
- **CI: portas erradas nos testes de integração**: `docker-compose.test.yml` expõe Postgres/Redis
  em `5433`/`6380`, mas nada definia `DATABASE_URL`/`REDIS_URL` para os passos `pnpm db:migrate`/
  `pnpm test:integration` — sem isso, cairiam nos defaults de dev (`5432`/`6379`, nada escutando
  ali) ou falhariam a validação de env. Corrigido com `env:` explícito no job, batendo com as
  portas reais do compose de teste.
- **`next start` incompatível com `output: "standalone"`**: o próprio Next avisou em runtime. O
  script `start` foi trocado para `node .next/standalone/apps/web/server.js`, e como o output
  standalone não inclui `public/`/`.next/static`, um script (`copy-standalone-assets.mjs`) foi
  adicionado ao `build` para copiá-los para perto do server — sem isso, CSS/assets estáticos
  dariam 404 ao rodar `pnpm start` localmente (o Docker já fazia essa cópia certo, via `COPY`
  separados no Dockerfile).

**Testado de verdade:** suíte completa (`lint`, `typecheck`, `build`, `test`) rodou limpa via
Turborepo depois de cada correção; a condição de corrida do typecheck foi reproduzida e corrigida
com confirmação em 3 execuções separadas; instalei o Chromium do Playwright e rodei os testes E2E
de verdade — inclusive um novo teste que sobe a API real ao lado do web e confirma que o fetch
`/health` do browser resolve para um estado conclusivo (não fica preso em "carregando"), provando
a integração real entre os dois serviços, não apenas cada um isoladamente.

**Por quê:** o pedido foi explicitamente para procurar erros/bugs e testar, não apenas reler o
código. A maioria dos achados acima (a corrida do typecheck, o `next start` incompatível, o
`.dockerignore` ausente) só apareceu ao efetivamente rodar os comandos em cenários realistas —
reforça que "compilou" e "os testes que eu escrevi passam" não são a mesma coisa que "está livre
de bugs".

## 2026-09-02 — Camada de persistência completa (modelagem, migrations, seed)

**O quê:** modelado o banco de dados relacional completo do SeaPass em `schema.prisma` — 26
models cobrindo auth/RBAC (User, Role, UserRole), organizadores, navios/decks/cabines/categorias,
cruzeiros/itinerário/portos/preço por categoria, venues/artistas/eventos, restaurantes/dining
slots, experiências, e o cluster de reservas (Booking, BookingGuest, Payment, Ticket, CheckIn,
Coupon, Notification, AuditLog) — este último modelado para integridade referencial completa,
mas sem logica de negocio nem dados de seed, conforme pedido.

Decisões de modelagem deliberadas (explicadas em detalhe na resposta ao usuário): papéis via
tabela `Role` + `UserRole` (escopada a organizador quando aplicável) em vez de uma coluna enum
fixa em `User`, sem uma tabela `Permission` dinâmica separada (justificado — 4 papéis fixos não
precisam de permissões compostas em runtime); `Cabin.status` (enum) em vez de soft-delete
genérico; `ItineraryStop.portId` opcional para representar dias no mar; `CruiseCabinPricing`
como entidade própria (preço é por cruzeiro, não fixo na categoria); `Coupon` referenciado
diretamente por `Booking.couponId` em vez de uma tabela de junção de resgate.

**Testado de ponta a ponta com infraestrutura real** (não só schema válido): instalei
`embedded-postgres` e `redis-memory-server` num diretório temporário fora do repo — um Postgres
18 e um Redis reais rodando localmente sem Docker. Com eles:

- `prisma migrate dev --name init` criou e aplicou a migration inicial de verdade.
- `prisma migrate deploy` confirmado como no-op correto em cima da mesma migration (simula o
  passo de release do CI).
- `pnpm db:seed` populado com sucesso e **confirmado idempotente** (rodado 2x, contagem de linhas
  igual, sem duplicatas) — 5 usuários, 4 papéis, 5 atribuições de papel, 2 organizadores, 1 navio,
  4 decks, 4 categorias de cabine, 22 cabines, 3 portos, 1 cruzeiro publicado, itinerário de 5
  dias (incluindo 1 dia no mar sem porto), 4 preços por categoria, 3 venues, 2 artistas, 4
  eventos, 2 restaurantes, 3 dining slots, 3 experiências, **0 bookings** (conforme pedido).
- `GET /health` finalmente confirmado retornando `200` com `database: up` e `redis: up` — a
  primeira vez nesta conversa com infraestrutura real de verdade (até aqui só tinha sido
  verificado o caminho degradado, sem Postgres/Redis).
- Teste de integração da API (`pnpm test:integration`, que precisa de banco/Redis reais) rodado
  pela primeira vez de verdade — passou com `200`.

**Dois bugs reais encontrados e corrigidos durante a implementação:**

1. **Chave composta com coluna nullable não funciona no `upsert`/`findUnique` do Prisma Client**:
   `UserRole.organizerId` é opcional (papéis de passageiro/admin global não têm organizador), mas
   o tipo gerado pelo Prisma para `@@unique([userId, roleId, organizerId])` exige
   `organizerId: string` — não aceita `null`, mesmo a coluna sendo nullable no banco (o
   constraint SQL funciona normalmente). Corrigido no seed com `findFirst` + `create`
   condicional em vez de `upsert` por chave composta.
2. **`noUncheckedIndexedAccess` (que a própria base de tsconfig já define) pegou acessos por
   índice em `Record<string, string>` no seed** (`decks[numero]`, `categories[slug]`) que
   poderiam ser `undefined` — corrigido com checagens explícitas que lançam erro claro em vez de
   deixar passar um `undefined` silencioso.

Também: `PrismaService`/`PrismaModule` restaurados e o health check do banco voltou a usar
Prisma em vez do `pg` puro (ver [ADR-0004](architecture/decisions/0004-prisma-reinstated-with-domain-model.md),
que resolve o que o [ADR-0002](architecture/decisions/0002-database-health-check-without-prisma-model.md)
tinha deixado como pendência).

**Por quê:** modelagem "profissional" pedida explicitamente — cada decisão de schema (PK, FK,
índice, unique constraint, cardinalidade) foi pensada e documentada, não gerada por padrão. E
testar contra infraestrutura real (em vez de só validar sintaxe) foi o que revelou os dois bugs
acima, que uma verificação só-de-schema não pegaria.

## 2026-09-02 — Autenticação e autorização completas (RBAC)

**O quê:** implementado o sistema completo de auth do SeaPass para os 4 perfis (Passenger,
Organizer Admin, Organizer Staff, Platform Admin):

- **Auth**: cadastro (passageiro e organizador — este último cria `Organizer` com status
  `PENDING`), login, logout, access token (JWT, 15 min) + refresh token (opaco, rotação com
  detecção de reuso, cookie httpOnly), recuperação de senha em modo dev (token devolvido na
  resposta/logado, nunca em produção), hash de senha com `bcryptjs`.
- **RBAC**: `JwtAuthGuard` + `RolesGuard` globais ("protegido por padrão", `@Public()` como
  opt-out), decorators `@Roles(...)`/`@CurrentUser()`, controle de posse de recurso explícito nos
  services (ex: organizador só edita os próprios cruzeiros — 404, não 403, se não pertence).
- **2 models novos** (`RefreshToken`, `PasswordResetToken`, guardados só como hash) + migration
  real aplicada.
- **8 módulos de recurso** (thin, pensados para exercitar o RBAC, não para implementar o sistema
  de reservas): `auth`, `users`, `organizers` (convite de staff, ocupação, vendas),
  `cruises` (catálogo público + CRUD do organizador), `events` (criação escopada ao cruzeiro),
  `bookings`/`tickets` (leitura escopada ao próprio passageiro + check-in para staff), `admin`
  (aprovar/suspender organizador, audit log).
- `AuditLogService` passou a ser usado de verdade (registro, aprovação/suspensão de organizador).
- Contratos Zod novos em `packages/contracts` para cada fluxo (auth, invite-staff, cruise, event,
  check-in), compartilháveis com o frontend depois.

**Testado de ponta a ponta com Postgres/Redis reais** (não só mocks): ~30 chamadas manuais via
`curl` cobrindo cada cenário (cadastro, login, RBAC por papel, cross-organizador, refresh/rotação/
reuso, logout, recuperação de senha) **antes** de escrever os testes automatizados — e cada bug
real encontrado assim foi corrigido antes de formalizar em teste. Depois: 39 testes unitários
(services, guards, pipe, util de organizerId) + 14 testes de integração reais (fluxo completo de
auth + limites de RBAC, incluindo criar dois organizadores de verdade via API e provar que um não
enxerga o cruzeiro do outro) — 53 testes, todos verdes.

**Três bugs reais encontrados testando de verdade (não na teoria):**

1. **`/health` passou a exigir autenticação** — esqueci de marcar `HealthController` com
   `@Public()` ao tornar o `JwtAuthGuard` global. Pego imediatamente no primeiro `curl` manual
   (retornou `401` em vez de `200`). Lembrete registrado no [ADR-0005](architecture/decisions/0005-auth-and-rbac-design.md)
   sobre o custo de guards globais "seguros por padrão": exigem auditar toda rota pública já
   existente ao introduzi-los.
2. **`@UsePipes()` no nível do método valida TODOS os parâmetros, não só `@Body()`** — em todo
   handler que também tinha `@CurrentUser()` (ex: `POST /organizers/me/staff`), o Zod tentava
   validar o payload do JWT contra o schema do corpo e falhava. Descoberto testando o convite de
   staff via `curl` ("password: Required, fullName: Required" mesmo enviando os dois). Corrigido
   em todos os controllers trocando para `@Body(new ZodValidationPipe(Schema))` (pipe escopado ao
   parâmetro, não ao método).
3. **`noUncheckedIndexedAccess` pegou 3 bugs de tipo reais** antes mesmo de rodar: acesso a
   `Prisma.InputJsonValue` mal tipado no audit log, `override` faltando no `JwtAuthGuard`, e
   indexação de `Record` com uma chave possivelmente `undefined` no parser de duração
   (`"15m"` → ms) — resolvido redesenhando com um union type `'s'|'m'|'h'|'d'` em vez de
   `Record<string, number>` genérico.
4. **O catálogo de papéis (`roles`) só existia via `pnpm db:seed`, e o CI nunca roda o seed** —
   só `pnpm db:migrate` (ver `.github/workflows/ci.yml`, job `integration-tests`). Como todo
   cadastro (`register`/`register/organizer`) faz `role.findUniqueOrThrow({ where: { key } })`,
   **nenhum cadastro funcionaria em CI** mesmo com a migration aplicada — só não apareceu nos
   testes locais porque o Postgres que eu uso para testar já tinha sido semeado numa etapa
   anterior desta conversa. Achado ao revisar o próprio `ci.yml` de propósito, e confirmado
   criando um banco novo, rodando só `prisma migrate deploy` (sem seed) e tentando `/auth/register`
   contra ele. Corrigido movendo o catálogo de papéis para dentro de uma migration
   (`20260902210000_seed_core_roles`, `INSERT ... ON CONFLICT DO NOTHING` — dado de referência
   obrigatório, não dado de demonstração) e ajustando o teste de RBAC do admin para criar seu
   próprio usuário `PLATFORM_ADMIN` via `UsersService` em vez de depender do usuário do seed.
   Reproduzido o cenário exato do CI (banco novo → `migrate deploy` → suíte de integração inteira,
   sem seed) e confirmado: 14/14 testes passam.

**Por quê:** o pedido foi por um sistema "completo" de auth/autorização com proteção de rotas,
RBAC e tratamento seguro de erros — a única forma de saber se isso é verdade (não só "parece
certo") é bater nele de propósito: tentar acessar sem token, com o papel errado, com o recurso de
outro organizador, reusar um refresh token revogado. Cada um desses ataques simulados encontrou
algo — reforça o padrão já estabelecido nesta conversa de testar contra infraestrutura real antes
de declarar algo pronto.

## 2026-09-03 — Módulo de catálogo (Ships, Cruises e mais 10 entidades)

**O quê:** implementado o módulo de catálogo completo — 12 entidades (Ships, Decks, Cabins,
Cabin Categories, Cruises, Itinerary Stops, Ports, Events, Artists, Venues, Restaurants,
Experiences), com **Cruises** como núcleo: criação, edição, publicação/despublicação (com regra
de negócio real — precisa de itinerário e preço antes de publicar), consulta, listagem paginada,
filtros (tema, destino, período, faixa de preço, organizador, status) e ordenação (inclusive por
preço mínimo).

**Arquitetura em 4 camadas** (pedido explícito desta etapa, registrado no
[ADR-0006](architecture/decisions/0006-catalog-layering.md)): `presentation/` (controllers, só
HTTP) → `application/` (services, casos de uso + checagem de posse por organizador) →
`persistence/` (um repository por entidade, thin wrapper sobre Prisma), com `domain/` isolado de
framework/Prisma para as duas peças que têm regra de negócio real testável isoladamente:
`CruiseStatusPolicy` (transições DRAFT/PUBLISHED) e o utilitário de paginação. Módulos mais
simples (`bookings`, `tickets`, `admin`) deliberadamente continuam com o padrão de 2 camadas —
essa separação de 4 camadas não virou uma regra automática para todo módulo futuro, só onde há
lógica real o bastante pra justificar (ADR explica o porquê).

`src/modules/cruises/` e `src/modules/events/` (criados durante a etapa de auth) foram
consolidados dentro do novo `catalog/`, mantendo as mesmas rotas (`/cruises`, `/events`) — nenhum
cliente existente quebra.

**Testado de ponta a ponta com Postgres/Redis reais**: ~40 chamadas manuais via `curl` cobrindo
cada entidade e o fluxo completo de cruzeiro (criar → tentar publicar sem itinerário/preço e
receber `409` → adicionar itinerário → adicionar preço → publicar → aparecer no catálogo público
→ despublicar → sumir do catálogo) **antes** de formalizar em testes automatizados — mesmo padrão
das etapas anteriores. Depois: 79 testes no total (58 unitários + 21 de integração), incluindo um
novo `catalog.e2e-spec.ts` dedicado a filtros/paginação/ordenação com um fixture de 3 cruzeiros
(2 publicados com preços/temas/destinos diferentes, 1 em rascunho) criado via API real, provando
que rascunho nunca aparece no público e que a ordenação por preço funciona nos dois sentidos.

**Dois achados reais durante a implementação:**

1. **Prisma não ordena por agregado (`_min`/`_max`) de uma relação 1:N em `findMany`** — só
   `_count`. Descoberto pelo `tsc` recusando `orderBy: { cabinPricings: { _min: { price } } }`
   antes mesmo de rodar. Resolvido com `groupBy` (que Prisma *suporta* ordenar por aggregate) para
   pegar os ids na ordem certa, seguido de um `findMany({ where: { id: { in } } })` reordenado em
   memória (Prisma não preserva a ordem de um filtro `in`). Detalhado no ADR-0006.
2. **Endpoint de preço por categoria não estava no pedido, mas era pré-requisito** — a própria
   regra de negócio que implementei (`CruiseStatusPolicy.assertCanPublish` exige preço definido)
   tornaria impossível publicar um cruzeiro pela API sem um jeito de definir esse preço. Adicionado
   `POST /cruises/:id/pricing` (escopado ao organizador dono, categoria precisa ser do mesmo
   navio) — sem isso, o fluxo de publicação documentado não seria demonstrável de ponta a ponta.

**Uma falha de teste real, não de código:** ao reescrever o teste de RBAC para usar os novos
endpoints (`POST /ships`, `/publish` em vez de `PATCH status`), um `expect(403)` copiado do teste
antigo falhou com `404` — investigado e confirmado que o **código estava certo**: a checagem de
posse do navio (`ShipsService.findOwnedByOrganizerOrThrow`) já segue o mesmo princípio de não
revelar existência de recurso a quem não é dono (ADR-0005), então 404 é o comportamento correto e
consistente; o teste antigo é que esperava o comportamento anterior ao ADR-0005. Corrigida a expectativa do
teste, não o código.

**Por quê:** o pedido foi por descoberta e gestão de conteúdo com separação arquitetural clara —
a mesma disciplina das etapas anteriores (testar contra infraestrutura real antes de escrever
teste automatizado, verificar cada suposição em vez de assumir) encontrou uma limitação real do
Prisma e um pré-requisito de negócio que não estava no pedido original, ambos resolvidos antes de
declarar a etapa pronta.

## 2026-09-03 — Frontend público (Home, exploração, detalhe de cruzeiro)

**O quê:** implementado o frontend público do SeaPass — Home, página de exploração
(`/cruzeiros`, com busca livre, filtros de tema/destino/data/preço e ordenação, tudo refletido
na URL) e página de detalhe (`/cruzeiros/[slug]`) com hero visual, informações principais,
itinerário, atrações do navio, eventos, experiências, restaurantes e categorias de cabine.
Estados de loading (`loading.tsx` por rota), erro (`<ErrorState>` inline), vazio
(`<EmptyState>` na listagem e `not-found.tsx` no detalhe) e sucesso implementados e verificados
visualmente contra a API real — inclusive derrubando a API de propósito para confirmar que o
estado de erro renderiza corretamente em vez de quebrar a página. Decisões registradas no
[ADR-0007](architecture/decisions/0007-public-frontend.md).

**Pré-requisitos de backend feitos junto:** busca livre (`q`) em `CruiseQuerySchema`, correção de
um bug real de colisão de filtros `OR` em `CruisesRepository.buildCruiseWhere` (destino e busca
livre se sobrescreveriam se usados juntos — corrigido com um array `AND` acumulando cada filtro
como entrada independente) e enriquecimento do include de detalhe do cruzeiro com
`ship.venues`/`ship.restaurants` para a página de detalhe não precisar de round-trips extras.

**Um bug de acessibilidade real, encontrado e corrigido antes de reportar a etapa como pronta:**
o componente `Field` do painel de filtros renderizava `<label htmlFor={id}>` mas nunca aplicava
esse `id` ao input/select filho de fato — os `children` eram passados adiante sem alteração,
apesar de um comentário afirmando o contrário. Leitores de tela não conseguiam associar o rótulo
ao campo, e clicar no rótulo não focava o input — contradizendo diretamente o pedido de
"priorizar acessibilidade". Corrigido com `cloneElement`/`isValidElement` injetando o `id` real
no filho; coberto por um teste de regressão (`tests/unit/cruise-filters.test.tsx`) que verifica
`label[for] === input.id` para todos os campos do painel.

**Testado de ponta a ponta:** typecheck, lint e build de produção limpos; 13 testes unitários
(Vitest — utilitários de formatação e a regressão de acessibilidade acima) e 6 testes E2E
(Playwright, reescritos — os antigos testavam o widget de debug `ApiStatus` removido nesta
etapa) rodando contra o dev server real e a API/Postgres/Redis reais, cobrindo: navegação
Home → listagem, sucesso/erro na Home, filtros com rótulos acessíveis, busca sem resultado
(estado vazio), slug inexistente (404) e a página de detalhe completa de um cruzeiro real.
Screenshots (Playwright, desktop e mobile) inspecionadas visualmente para os quatro estados.

**Decisões de escopo:** os widgets de debug (`ApiStatus`, `health.service`) foram removidos —
eram apropriados para o bootstrap inicial, não para um "produto real de turismo", e sua função de
verificação é superada pelas páginas reais (API fora do ar agora aparece como estado de erro de
verdade, não como um badge de status). "Atrações" foi interpretado como os `Venue`s do navio
(teatro, lounge, deck) — não existe uma entidade "Atração" própria no catálogo (ADR-0007 detalha
o porquê). Checkout/reserva continuam fora de escopo, como já definido.

**Por quê:** o pedido foi explícito em não parecer "CRUD administrativo" e em priorizar UX,
responsividade, acessibilidade e consistência visual — a mesma disciplina das etapas anteriores
(testar contra infraestrutura real, não assumir que algo funciona) encontrou um bug de
acessibilidade real que contradizia o próprio pedido, corrigido antes de declarar a etapa pronta.

## 2026-09-03 — Mapa interativo do navio

**O quê:** implementado o mapa interativo do navio na página de detalhe do cruzeiro — seleção de
deck, zoom/pan, cabines e instalações (teatro, lounge, bar, piscina, área de lazer, restaurantes)
clicáveis, tooltip no hover, painel de detalhe no clique, legenda e 4 estados reais de
disponibilidade de cabine (disponível/em reserva temporária/reservada/indisponível). Decisões
completas em [ADR-0008](architecture/decisions/0008-ship-deck-map.md).

**Pré-requisitos de backend:** `Venue` ganhou um campo `type` real (enum THEATER/LOUNGE/BAR/POOL/
LEISURE/OTHER — migration `20260903125431_add_venue_type`), sem o qual o mapa não teria como
distinguir bar de piscina de teatro. Novo endpoint público `GET /cruises/:slug/deck-map` compõe
decks + cabines (com categoria, preço da categoria PARA ESTE cruzeiro, e disponibilidade) + venues
+ restaurantes numa única chamada. Disponibilidade é regra de negócio real, isolada em
`CabinAvailabilityPolicy` (domain puro, testado): cruza `Cabin.status` com as reservas
`PENDING`/`CONFIRMED` do cruzeiro, incluindo a regra (já documentada no schema, nunca antes
implementada) de que um hold `PENDING` expirado volta a ficar disponível.

**Decisão de arquitetura que vale destacar:** nenhuma coordenada de posição foi adicionada ao
banco (nem em `Cabin`, nem em `Deck`, nem em `Venue`). O layout da planta é calculado no frontend
por uma função pura (`computeDeckLayout`, casco fixo + cabines em duas faixas + instalações
empacotadas em "prateleiras") a partir dos dados reais do deck — o pedido dispensou precisão
arquitetônica ("não precisa representar um navio real"), e coordenadas inventadas no banco
pareceriam dado real sem ser. Qualquer deck/cabine cadastrado no futuro ganha planta automática,
sem trabalho de autoria manual.

**Seleção de cabine preparada para checkout, não implementada:** `ShipMap` aceita um
`onSelectCabin` opcional que, quando fornecido, habilita um botão "Selecionar cabine" no painel de
detalhe. A página de cruzeiro (uso atual) não passa essa prop — o mapa é só consulta hoje. Checkout
em si continua fora de escopo, como definido em etapas anteriores desta conversa.

**Um bug real encontrado durante a verificação visual:** a legenda de disponibilidade reusava as
mesmas classes Tailwind `fill-*`/`stroke-*` das cabines do mapa (SVG) num `<span>` HTML comum —
`fill`/`stroke` não têm efeito fora de SVG, então os quadradinhos coloridos da legenda apareciam
sem cor nenhuma. Corrigido separando classes de SVG (`className`) das de HTML
(`swatchClassName`, `bg-*`/`border-*`) em `availability-meta.ts`. Também descoberto (e corrigido
reiniciando o processo com `.next` limpo): o dev server do Next, de tantas horas e edições nesta
conversa, tinha o pipeline de CSS do HMR corrompido (arquivos `.css` devolvendo 404) — fazia o
casco/cabines aparecerem pretos independente do bug da legenda.

**Testado em 4 camadas:** `cabin-availability.policy.spec.ts` (8 casos, domínio puro) e
`deck-layout-engine.test.ts` (8 casos, geometria pura) unitários; um teste de integração novo em
`catalog.e2e-spec.ts` que cria deck/cabine/reserva de verdade (via API + Prisma direto, já que não
há endpoint de checkout) contra Postgres real e verifica o endpoint `/deck-map`; 2 testes E2E
Playwright (`ship-map.spec.ts`) contra o dev server e API reais; e inspeção visual manual (screenshots
Playwright) dos 4 estados de disponibilidade, zoom, tooltip, painel de detalhe e responsividade
mobile — incluindo forçar os 4 estados de verdade no banco (seed agora cria 1 reserva confirmada,
1 hold pendente válido, 1 cabine em manutenção) em vez de simular na UI.

**Por quê:** o pedido chamou isto explicitamente de "um dos principais diferenciais visuais" e
pediu separação clara entre dados/visualização/regra de negócio e um componente que não fosse
"impossível de manter" — a mesma disciplina desta conversa (testar contra infraestrutura real,
nunca simular o que a API real já pode fazer) levou a modelar disponibilidade como regra de
negócio de verdade (não um campo decorativo) e a preparar — sem implementar — o ponto de extensão
que o checkout vai precisar mais adiante.

## 2026-09-03 — Motor de disponibilidade de cabine (hold, concorrência, expiração)

**O quê:** implementado o motor completo de reserva temporária de cabine — consulta de
disponibilidade, criação de hold, confirmação, cancelamento, liberação e expiração — com garantia
real (não só documentada) de que duas pessoas não conseguem reservar a mesma cabine ao mesmo
tempo. Racional completo, incluindo por que a estratégia de concorrência escolhida evita
overbooking, em [ADR-0009](architecture/decisions/0009-cabin-hold-engine.md).

**Terminologia:** `BookingStatus.PENDING` foi renomeado para `HELD` (migration `ALTER TYPE ...
RENAME VALUE`, sem perda de dado) — o pedido nomeia os 3 estados explicitamente como
AVAILABLE/HELD/BOOKED, e manter `PENDING` no schema enquanto o código só *chamava* isso de "hold"
em comentários era confuso. `CabinAvailabilityPolicy` (do mapa do navio, ADR-0008) foi ajustada
para o mesmo vocabulário — é a primeira funcionalidade a de fato *escrever* os estados que aquela
policy até então só projetava para leitura.

**Estratégia de concorrência (o núcleo do pedido):** transação Prisma + `SELECT ... FOR UPDATE` na
linha da cabine, que serializa de verdade tentativas concorrentes de hold (a segunda transação
bloqueia até a primeira commitar, depois re-lê o estado já consolidado) — mais expiração inline do
hold antigo dentro da mesma transação/lock, mais um índice único parcial no Postgres
(`CREATE UNIQUE INDEX ... WHERE status IN ('HELD','CONFIRMED')`) como rede de segurança caso um
bug futuro pule a transação. Avaliei e descartei lock distribuído via Redis como mecanismo
*primário* — o Postgres já é a fonte da verdade transacional, um lock Redis por cima seria uma
segunda fonte de verdade que pode divergir, exatamente o tipo de "solução artificial" que o pedido
pediu para evitar. Redis/BullMQ entram numa função secundária, genuinamente justificada: agendar a
expiração *proativa* de cada hold (job com delay = tempo até `holdExpiresAt`) para boa UX — nunca
a garantia de corretude, que já está fechada pela camada 1 (expiração inline no próximo
hold-attempt da mesma cabine fecha o ciclo mesmo se o job nunca rodar).

**Testes de concorrência de verdade:** `cabin-hold-concurrency.e2e-spec.ts` dispara `Promise.all`
de 12 tentativas de hold **verdadeiramente simultâneas** (sem `await` entre os disparos) para a
mesma cabine, de 12 passageiros registrados de verdade, contra Postgres real — e verifica que
exatamente 1 recebe `201` e as outras 11 recebem `409`, checado tanto pela resposta HTTP quanto
pelo estado real do banco. Repete para a corrida em cima de uma reserva já existente (8 tentativas
concorrentes de confirmar, depois de liberar, a mesma reserva). `bookings.e2e-spec.ts` cobre o
ciclo de vida completo fora da corrida (posse entre usuários reais, cruzeiro não publicado, cabine
em manutenção, fechamento real do ciclo de expiração forçando `holdExpiresAt` pro passado). Mais
16 testes unitários da política pura de transição de estados e 16 do service com repositório
mockado. Total: 101 testes unitários (+34 desde a etapa anterior) e 4 suítes de integração.

**Dois obstáculos técnicos reais, resolvidos:**
1. `@nestjs/bullmq`/`@nestjs/bull-shared` publicam só ESM — quebrava o Jest (que por padrão nunca
   transforma `node_modules`) tanto nos testes unitários (`BookingsService` importa `InjectQueue`)
   quanto nos de integração (o app inteiro precisa do `BullModule`). Nos unitários, mockei
   `@nestjs/bullmq` (só a assinatura do decorator, já que o teste instancia o service com `new`,
   sem o container do Nest). Nos de integração, ajustei `transformIgnorePatterns` pra deixar o
   ts-jest transformar especificamente esses dois pacotes.
2. O BullMQ mantém a conexão Redis dedicada e timers internos vivos mesmo depois de `app.close()`
   — Jest nunca via o processo terminar sozinho nos testes de integração. Adicionado `--forceExit`
   ao script `test:integration` (mitigação padrão recomendada pelo próprio Jest pra esse cenário;
   os testes já reportam passar/falhar antes do force-exit acontecer).

**Por quê:** o pedido chamou isto de "uma parte crítica do projeto" e pediu explicitamente para
não usar uma solução artificial só pra passar no teste, e para documentar por que a estratégia
escolhida evita overbooking de verdade — a mesma disciplina desta conversa (testar contra
infraestrutura real, provar em vez de assumir) levou a escrever um teste que dispara concorrência
de verdade contra o Postgres real, não uma simulação sequencial disfarçada de concorrente.

## 2026-09-03 — Domínio de Booking (hóspedes, adicionais, preço, checkout simulado)

**O quê:** implementado o domínio completo de reserva sobre o motor de hold (ADR-0009): fluxo
cruzeiro → cabine → hóspedes → adicionais → reserva → checkout → confirmação de pagamento
simulada. Racional completo em [ADR-0010](architecture/decisions/0010-booking-domain.md).

**Estados:** `HELD` não foi renomeado de novo (já significava o que o pedido chama de `PENDING`);
ganhou vizinhos novos — `PAYMENT_PENDING` (checkout feito, pagamento simulado pendente) e
`EXPIRED` como valor de enum de verdade (antes, hold vencido virava `CANCELLED` com motivo em
texto; agora "o sistema fechou por timeout" é distinguível de "o usuário cancelou" pela própria
coluna `status`).

**Preço, descontos, taxas, total:** quatro colunas reais (`subtotalAmount`, `discountAmount`,
`feeAmount`, `totalAmount`), calculadas por uma única função pura
(`BookingPricingPolicy.computeBreakdown`) reusada em `holdCabin`, `updateDetails` e no próprio
seed — nunca um número recalculado à mão em dois lugares.

**Hóspedes e adicionais:** `BookingGuestsPolicy` garante exatamente um hóspede titular e nunca
mais que `maxOccupancy`; nova tabela `BookingExperience(bookingId, experienceId, priceAtBooking)`
com preço congelado no momento da seleção, imune a mudanças posteriores de preço do catálogo. `PUT
/bookings/:id/details` substitui hóspedes+adicionais e recalcula o preço numa única chamada.

**Checkout sem gateway real:** reaproveitado o modelo `Payment` que já existia no schema desde uma
etapa anterior (`simulatedTransactionId`, comentado como "equivalente ao ID do gateway real") —
sinal de que o plano sempre foi simular. `POST .../checkout` cria o `Payment` simulado
(`HELD -> PAYMENT_PENDING`); `POST .../confirm-payment` faz o papel do callback do gateway
inexistente (`PAYMENT_PENDING -> CONFIRMED`). Nenhum gateway real é chamado.

**Idempotência:** três mecanismos, cada um resolvendo um risco diferente — `Idempotency-Key` na
criação do hold (padrão Stripe, testado com uma corrida de verdade via `Promise.all`); `checkout`
idempotente por método de pagamento (reenviar o mesmo checkout devolve o estado atual); e
`confirmPayment` idempotente por estado (retry de callback de gateway já processado não falha, só
devolve a reserva já `CONFIRMED` — testado com 8 chamadas concorrentes reais em
`cabin-hold-concurrency.e2e-spec.ts`, provando que não existe efeito colateral duplicado: um único
`Payment` aprovado ao final).

**Testes:** 3 novas policies unitárias puras (lifecycle/pricing/guests), `bookings.service.spec.ts`
reescrito com repositório mockado, e um novo `booking-domain.e2e-spec.ts` (13 casos) contra
Postgres/Redis reais cobrindo o fluxo ponta a ponta, cabine indisponível (manutenção e já
reservada) nunca virando reserva, posse entre usuários reais (404, não 403) e os dois cenários de
idempotência. Os arquivos de integração de etapas anteriores (`bookings.e2e-spec.ts`,
`cabin-hold-concurrency.e2e-spec.ts`) foram atualizados para o novo fluxo de dois passos
(checkout → confirm-payment) e para o novo status `EXPIRED`. Total: 143 testes unitários e 7
suítes de integração (52 testes), todos passando contra infraestrutura real.

**Por quê:** o pedido pediu explicitamente para reusar o mecanismo de hold em vez de recriar
concorrência do zero, para garantir que cabine indisponível nunca vire reserva, e para implementar
idempotência "onde fizer sentido" — a mesma disciplina desta conversa (nunca simular o que a
infraestrutura real já resolve, nunca uma solução artificial só pra passar no teste) levou a
reaproveitar o `Payment` já modelado em vez de inventar um novo mecanismo de checkout, e a apoiar
toda idempotência no estado que já existe (status/idempotencyKey) em vez de uma tabela de chaves
processadas separada.

## 2026-09-03 — Motor de preços (PricingEngine + CouponPolicy)

**O quê:** extraído o cálculo de preço para um domínio próprio (`modules/pricing/domain/`,
`PricingEngine` + `CouponPolicy`), substituindo a antiga `BookingPricingPolicy` (removida, não
deprecated), e expandido o cupom com valor mínimo, limite por usuário e cruzeiros aplicáveis
(many-to-many). Racional completo em
[ADR-0011](architecture/decisions/0011-pricing-engine.md).

**Número de passageiros no preço final:** em vez de reinterpretar `CruiseCabinPricing.price` como
"preço por pessoa" (mudaria o significado de uma coluna já migrada e testada), criada uma taxa de
embarque fixa por passageiro (`PricingEngine.PORT_FEE_PER_PASSENGER`, R$50) somada à taxa de
serviço percentual — aditivo, reversível, e um conceito real de cruzeiro (taxa de porto cobrada por
pessoa). Verificado ao vivo contra o dev server: hold com 0 hóspedes cobra só 5% de taxa; após
informar 2 hóspedes, a taxa sobe em R$100 (50 x 2).

**Sete regras de cupom, em ordem fixa** (cupom inexistente → desativado → expirado → incompatível
→ valor mínimo → limite global → limite por usuário → válido) — a ordem é parte do contrato,
testada explicitamente. "Cupom já utilizado" (limite por usuário) conta reservas cujo
`confirmedAt` não é nulo, não o status atual — uma reserva confirmada e depois cancelada continua
contando como "usada", senão um cupom de primeira compra poderia ser resetado só cancelando e
refazendo a reserva (mesmo princípio que já valia para o limite global desde ADR-0010).

**"Cruzeiros aplicáveis" virou tabela, não coluna:** nova `CouponCruise` (many-to-many, mesmo
padrão de `BookingExperience`) substitui o antigo `Coupon.cruiseId` singular — um cupom agora pode
valer para vários cruzeiros específicos, não só "um" ou "todos". Migration com backfill: cupom que
já tinha um `cruiseId` vira uma linha na tabela nova antes da coluna antiga ser derrubada.

**Precisão monetária:** todo o cálculo usa `Prisma.Decimal` (nunca `number`, testado explicitamente
contra o clássico `0.1 + 0.2 !== 0.3`), com arredondamento para 2 casas em cada valor no momento em
que é produzido — garante `subtotal - desconto + taxa == total` exatamente, sem fração de centavo
escondida, provado com casos que gerariam 3+ casas decimais sem o arredondamento.

**Testes:** `pricing-engine.spec.ts` (precisão, determinismo, clamps defensivos, escala por
passageiro) e `coupon.policy.spec.ts` (as sete regras, bordas de cada limite, ordem de precedência)
— totalmente unitários, sem banco. `booking-domain.e2e-spec.ts` ganhou 3 novos testes contra
Postgres real (valor mínimo, cupom incompatível, limite por usuário com dois usuários distintos).
Total: 172 testes unitários (+29) e 55 testes de integração (+3), todos passando.

**Por quê:** o pedido foi explícito em não colocar regra complexa em controller e em criar um
domínio/serviço dedicado — a mesma disciplina desta conversa (nunca duplicar lógica de preço em
dois lugares, sempre provar contra infraestrutura real) levou a promover o cálculo a um módulo
próprio em vez de só inchar a policy de Booking, e a escrever um teste que prova a ausência do bug
de ponto flutuante em vez de só confiar que `Prisma.Decimal` resolve isso sozinho.

## 2026-09-03 — Checkout completo via PaymentGateway (abstração + FakePaymentGateway)

**O quê:** implementado o checkout completo do SeaPass sobre uma abstração de gateway de
pagamento (`PaymentGateway`, porta) e uma implementação simulada (`FakePaymentGateway`, adaptador)
— novo módulo `modules/payments/`. Racional completo em
[ADR-0012](architecture/decisions/0012-checkout-payment-gateway.md).

**Fluxo, os 10 passos pedidos, todos mapeados:** receber a reserva → validar o hold → recalcular
preço/cupom no servidor (nunca confia em `Booking.totalAmount` já salvo, sempre reconstrói das
tabelas de origem) → criar `Payment` → chamar `paymentGateway.charge` (simula aprovação/recusa) →
atualizar o pagamento → confirmar (aprovado) ou liberar/cancelar (recusado) a reserva → cabine
confirmada automaticamente (derivada do status, sem escrita extra — ADR-0008) → ticket emitido
depois, assíncrono via BullMQ.

**Duas transações, não uma:** a criação do `Payment` e a aplicação do desfecho rodam em
transações separadas, com a chamada ao gateway acontecendo **fora** de qualquer transação — nunca
segurar o lock da reserva durante uma chamada de rede, o tipo de detalhe que só importa de verdade
quando se pensa em trocar por um gateway real de latência não-trivial.

**Estados tratados:** aprovado (`Payment` `APPROVED`, `Booking` `CONFIRMED`), recusado (`DECLINED` +
`failureReason`, `Booking` `CANCELLED` com o motivo), pendente (`PENDING` — boleto, assíncrono de
verdade), timeout (`PaymentGatewayTimeoutError`, distinto de um desfecho de negócio — nunca vira
sucesso nem falha às cegas), duplicata e retry (resolvidos pelo mesmo mecanismo: reenviar com a
mesma `Idempotency-Key` reutiliza a mesma tentativa, o gateway nunca cobra duas vezes).

**Um bug de corrida real, encontrado testando concorrência de verdade:** `confirmPayment`
originalmente decidia "há pagamento pendente?" a partir de uma consulta composta
(`findByIdForUser`) que não é atomicamente consistente entre suas sub-consultas — 8 chamadas
verdadeiramente concorrentes (`Promise.all`) a `confirm-payment` revelaram a janela: uma leitura
podia ver a reserva ainda `PAYMENT_PENDING` mas o pagamento já `APPROVED` (resolvido por uma
tentativa concorrente), gerando um 409 incorreto. Corrigido com uma consulta atômica de uma linha
só (`findLatestPayment`) e tratando "já resolvido por outra tentativa" como corrida perdida (devolve
o estado atual), não como erro de uso.

**Testes:** `bookings.service.spec.ts` ampliado (gateway mockado — aprovação, recusa, timeout,
retry, a corrida corrigida) e novo `checkout-payment-gateway.e2e-spec.ts` contra Postgres/Redis
reais (aprovação síncrona com emissão de ticket, recusa liberando a cabine, timeout+retry sem
cobrança dupla, 6 requisições concorrentes com a mesma chave de idempotência, preço recalculado
após o organizador mudar o preço da cabine). `booking-domain.e2e-spec.ts` e
`cabin-hold-concurrency.e2e-spec.ts` ajustados: PIX/cartão agora resolvem dentro do próprio
checkout (o `FakePaymentGateway` aprova na hora), BOLETO é o caminho que genuinamente fica
pendente, usado para exercitar `confirm-payment` de verdade.

**Como trocar por Stripe/Mercado Pago:** documentado no ADR-0012 com um esboço completo de
`StripePaymentGateway` — troca-se uma linha em `payments.module.ts`, nenhum código de `bookings`
muda, porque tudo depende só do token `PAYMENT_GATEWAY`, nunca da classe concreta.

**Por quê:** o pedido foi explícito em não acoplar a um provedor específico e em tratar cada estado
de pagamento como um caso de verdade, não um detalhe — a mesma disciplina desta conversa (provar
concorrência com `Promise.all` real, nunca simular) foi o que revelou o bug de corrida acima, que
uma suíte só com chamadas sequenciais jamais teria pego.

## 2026-09-04 — Ingresso digital e check-in (Staff) + primeira autenticação no frontend

**O quê:** implementado o módulo de check-in completo — código seguro, QR Code gerado sob demanda,
os quatro estados (`NOT_CHECKED_IN`/`CHECKED_IN`/`INVALID`/`ALREADY_USED`), lookup+confirmação em
duas etapas, uso único garantido sob concorrência real — e, pela primeira vez, autenticação de
verdade no frontend (`apps/web` só tinha páginas públicas até aqui). Racional completo em
[ADR-0013](architecture/decisions/0013-digital-ticket-checkin.md).

**`modules/tickets` promovido para camadas** (domain/persistence/application/presentation, mesmo
padrão de `bookings`/`catalog` — ADR-0006): cresceu de "listar + uma mutação simples" para uma
máquina de estados com concorrência a proteger, o mesmo limiar que já tinha justificado camadas
nos outros módulos. O antigo endpoint `/tickets/:id/check-in` (por id interno, sem lock, sem checar
reserva confirmada) foi substituído por `/check-in/lookup` + `/check-in/confirm` (por código, como
o Staff de fato opera).

**"Verificar se a reserva está confirmada" nos dois sentidos:** além de checar na hora do check-in,
`BookingsService.cancelBooking` agora também cancela (na mesma transação) os tickets já emitidos de
uma reserva `CONFIRMED` que é cancelada depois — sem isso um ticket continuaria `ISSUED` e passaria
no check-in mesmo com a reserva cancelada.

**Um bug de corrida real, de novo encontrado testando concorrência de verdade:** ao reaproveitar o
teste de checkout com 6 requisições concorrentes (ADR-0012) lado a lado com o novo teste de 10
check-ins concorrentes, uma tentativa tardia de `checkout` recebia `409` mesmo já tendo sido
aprovada por uma tentativa irmã — porque `checkout` faz duas transações com uma chamada de rede no
meio, e uma tentativa pode completar o ciclo inteiro antes de outra sequer travar a linha pela
primeira vez. Corrigido tratando `Booking.CONFIRMED` como um caso idempotente explícito logo no
início do `checkout`, não como um erro de estado — documentado no ADR-0013, não só no código.

**Base de autenticação do frontend:** `AuthProvider` guarda o access token só em memória (nunca
`localStorage` — o refresh via cookie httpOnly já foi desenhado para não expor token de longa
duração a XSS, ADR-0005) e tenta renovação silenciosa ao montar. Três páginas novas: `/login`,
`/ingressos` (passageiro, QR Code renderizado a partir de um data URI gerado pelo backend) e
`/organizador/check-in` (Staff — busca por código, mostra o estado, confirma).

**Verificação visual de ponta a ponta:** sem `chromium-cli` disponível, usado um script Playwright
standalone (o `@playwright/test` já instalado em `apps/web`) dirigindo um Chromium real contra os
dois dev servers — login como passageiro, QR Code renderizado de verdade, logout, login como
staff, busca de um ticket real, confirmação, nova busca mostrando "já utilizado", código inválido.
Todas as 6 capturas de tela conferidas visualmente, sem erros de console além dos 401 esperados do
refresh silencioso antes do primeiro login.

**Testes:** `check-in.policy.spec.ts` e `tickets.service.spec.ts` (unitários) + novo
`check-in.e2e-spec.ts` (Postgres/Redis reais — emissão automática, fluxo completo, código
inexistente, reserva cancelada invalida o ticket, isolamento entre organizadores, Staff-only,
autenticação obrigatória, e 10 tentativas verdadeiramente concorrentes de check-in do mesmo
ticket). Três testes de integração de etapas anteriores também corrigidos: dependiam de listar
`/cruises` sem filtro e paginação suficiente, o que ficou genuinamente flaky à medida que mais
arquivos de teste (rodando em paralelo) criam mais cruzeiros concorrentemente — corrigido
filtrando por `organizerId`/`q`, escopado a cada teste. Total: 207 testes unitários (+28) e 69
testes de integração em 9 suítes (+7, o novo arquivo), todos passando de forma consistente em
execuções repetidas (dado o bug de corrida acima, rodado mais de uma vez de propósito).

**Por quê:** o pedido foi explícito em não confiar no cliente para validação e em garantir uso
único do ticket — a mesma disciplina desta conversa (testar concorrência de verdade, nunca
simulada) revelou dois bugs reais nesta etapa (um na leitura composta de `confirmPayment`, outro
na corrida de `checkout`) que uma suíte mais tímida nunca teria pego, e a verificação visual real
(não só a suíte automatizada) foi o que confirmou que a interface pedida — "específica para
operação de check-in" — de fato funciona, não só compila.

## 2026-09-04 — Experiência interna do cruzeiro: reserva de eventos e restaurantes

**O quê:** implementado o módulo `modules/activities` — passageiros com reserva `CONFIRMED` agora
conseguem reservar eventos e horários de restaurante para a própria viagem, com proteção real
contra overbooking (capacidade) e contra conflito de horário na agenda do próprio passageiro.
Racional completo em [ADR-0014](architecture/decisions/0014-onboard-activity-reservations.md).

**Schema:** `EventReservation`/`DiningReservation` novos (status, `partySize`, restrições de
unicidade compostas por reserva); `BookingExperience.partySize` novo (congelado no momento da
seleção, mesmo padrão de `priceAtBooking` — ADR-0010); `Event.durationMinutes` novo.

**Overbooking evitado com o mesmo princípio de sempre:** `SELECT ... FOR UPDATE` no `Event`/
`DiningSlot` antes de somar `partySize` das reservas ativas e decidir (`ActivityCapacityPolicy`) —
a mesma estratégia de ADR-0009/0010/0012/0013, agora também estendida para `Experience.capacity`
dentro de `BookingsService.updateDetails` (travando todas as experiências selecionadas em ordem
estável de id, para não gerar deadlock entre chamadas concorrentes que se sobrepõem).

**Conflito de horário como política própria, separada de capacidade:**
`ActivitySchedulingPolicy` faz o teste clássico de sobreposição de intervalos contra a agenda já
confirmada da mesma reserva (eventos + restaurantes juntos); bordas que só se tocam não contam
como conflito, de propósito. Um `DiningSlot` recorrente (`@db.Time`, sem data) vira uma janela
absoluta comparável via `diningSlotWindowOn`, com tratamento do caso de atravessar meia-noite.

**Reservas são "criar + cancelar explícito", não "editar in-place":** reenviar a mesma reserva é
um retry idempotente; mudar o `partySize` de uma reserva já `CONFIRMED` exige cancelar e reservar
de novo — decisão deliberada para não precisar excluir "a reserva anterior de si mesma" das
consultas de capacidade e de conflito.

**Frontend — `/reservas`, "Minha viagem":** primeira página a juntar leitura autenticada
(`GET /bookings/me`) com o catálogo público já existente (`getCruiseBySlug`, que já trazia
eventos/restaurantes/horários — nenhuma rota nova de leitura de catálogo foi necessária). Mostra a
cabine, hóspedes, experiências já selecionadas (somente leitura) e duas listas com formulário de
adicionar + cancelar por item. Link "Minha viagem" adicionado à navegação do passageiro.

**Verificação:** dados reais semeados via API (organizador, navio, evento, restaurante, passageiro
com reserva confirmada) e um script Playwright standalone dirigindo um Chromium real contra os dois
dev servers — reserva de evento, reserva de restaurante, cancelamento (com a vaga voltando a
aparecer no formulário), e uma rejeição de conflito real (mesmo horário/data com `partySize`
diferente) exibida como erro na UI. Todas as 5 capturas de tela conferidas visualmente.

**Um teste de concorrência que só falhava por causa do ambiente, não do código:** os dois testes de
overbooking sob concorrência real (`Promise.all` verdadeiro) apresentaram `ECONNRESET`
intermitente ao criar dezenas de conexões HTTP `connection: close` simultâneas no loopback do
Windows durante o *setup* de cada teste (N reservas `CONFIRMED` distintas antes do burst de
verdade) — não na lógica sob teste, confirmado isolando cada teste e trocando qual dos dois "ia
primeiro" (o que falhava mudava, nunca os dois ao mesmo tempo). Corrigido criando as reservas de
setup **sequencialmente** e mantendo só o burst final de reservas de atividade — o que de fato
precisa ser concorrente — como `Promise.all`; estável em execuções repetidas depois disso.

**Testes:** `activity-capacity.policy.spec.ts`, `activity-scheduling.policy.spec.ts`,
`dining-schedule.util.spec.ts`, `activities.service.spec.ts` (unitários, repositório mockado) +
extensão de `bookings.service.spec.ts` para a capacidade de `Experience` + novo
`activities.e2e-spec.ts` (Postgres/Redis reais — reserva e cancelamento completos, ownership,
cruzeiro errado, retry idempotente, mudança de `partySize` rejeitada, overbooking sob concorrência
real para eventos E restaurantes, data fora do período do cruzeiro, capacidade por data de um
`DiningSlot`, conflito de horário evento×restaurante incluindo o caso de borda que não é conflito,
CRUD de `DiningSlot` restrito ao organizador dono do navio). Total: 248 testes unitários (+41) e 84
testes de integração em 10 suítes (+15, o novo arquivo), todos passando de forma consistente.

**Por quê:** o pedido foi explícito em não permitir que uma atividade ultrapasse sua capacidade
máxima e em testar conflitos de horário e capacidade — a mesma disciplina desta conversa (provar
concorrência com `Promise.all` real, nunca simular) foi reaplicada aqui, e desta vez revelou uma
armadilha do próprio ambiente de teste (não um bug de aplicação) que só apareceu por insistir em
concorrência de verdade em vez de aceitar o primeiro `ECONNRESET` como "só flakiness".

## 2026-09-04 — Minha Viagem: a experiência central do passageiro

**O quê:** `/reservas` reconstruída como a tela central do passageiro pós-reserva — cruzeiro, navio,
cabine, passageiros, ingresso digital + QR Code por hóspede, itinerário, eventos reservados,
restaurantes, experiências, status de check-in e uma **timeline dia a dia** ("DIA 1 / DIA 2...")
juntando tudo em ordem cronológica. Racional completo em
[ADR-0015](architecture/decisions/0015-minha-viagem.md).

**A timeline (`buildTripTimeline`, função pura testada isoladamente) é o núcleo:** monta cada dia a
partir de dado real — embarque/desembarque (`Cruise.embarkationDate`/`disembarkationDate`), paradas
de porto (`ItineraryStop.arrivalAt`/`departureAt`, sem horário fabricado quando nenhum dos dois
existe), eventos e restaurantes reservados, e check-ins JÁ realizados (nunca um horário adivinhado
para um check-in pendente). `Experience` fica de fora de propósito — o modelo não tem nenhum campo
de horário, então não há como posicioná-la de verdade num compromisso do dia.

**"Próximo na sua agenda":** o primeiro item da timeline (entre todos os dias) com horário `>= now`,
em destaque no topo da página — a resposta direta a "onde eu preciso estar?" sem precisar rolar.

**Remover atividades direto na timeline:** cada linha de evento/restaurante ganhou um botão
"Remover" inline, reaproveitando os endpoints de cancelamento já existentes (ADR-0014); um painel
"Adicionar ao roteiro" reaproveita os formulários de reserva já construídos. Experiências continuam
somente leitura (mudar depois de `CONFIRMED` segue fora de escopo, mesma razão do ADR-0014).

**Backend — o que faltava para o passageiro ver seu próprio check-in:** `GET /tickets/me` não tinha
`Booking.id` (não dava pra correlacionar um ticket com a reserva certa sem casar por nome — frágil)
nem o horário/local do check-in. Dois campos adicionados ao `select` de `TicketsRepository.findMine`
(mudança puramente aditiva, nenhum contrato quebrou): `booking.id` e `checkIns` (o mais recente).
Continua sem uma rota passageiro-facing dedicada — `Ticket.status` + o `checkIns[0]` novo já bastam.

**Arquitetura do frontend:** `apps/web/src/features/trip/` (mesmo padrão de pasta por feature de
`features/cruise-detail/`) — `trip-hero.tsx`, `trip-timeline-view.tsx`, `trip-tickets.tsx`
(cartões estilo "boarding pass"), `trip-info.tsx`, `trip-experiences.tsx`,
`add-activity-forms.tsx`. A página orquestra três fontes em paralelo (`bookings/me`, `tickets/me`,
depois o catálogo do cruzeiro) e monta a timeline com `useMemo`.

**Verificação:** dados reais semeados via API (itinerário com paradas de porto com e sem horário,
evento, restaurante, dois hóspedes, um deles com check-in real feito via staff) e um script
Playwright dirigindo um Chromium real: página completa com timeline de 4 dias, cabeçalho com
próximo compromisso, dois cartões de ingresso (um check-in feito com QR Code, outro pendente),
informações importantes com os documentos reais de cada hóspede, e remoção de uma reserva de
restaurante refletida imediatamente na timeline. Um efeito colateral instrutivo do teste: um
check-in forçado via API antes do dia de embarque (só para acelerar o teste) produziu um "Dia -1"
na timeline — matematicamente correto (a função não trava o número do dia em 1), deixado como está
de propósito, para não mascarar um dado real mesmo quando incomum.

**Testes:** `tests/unit/trip-timeline.test.ts` (Vitest, 9 casos — agrupamento por dia, ordenação
cronológica, combinação de data+hora de restaurante, parada de porto com/sem horário, check-in real
sem horário fabricado, reservas canceladas excluídas, `nextUp` ignorando itens passados). Extensão
de `check-in.e2e-spec.ts` com 2 testes novos confirmando os campos novos de `GET /tickets/me`. Total
API: 248 testes unitários e 85 de integração (+1). Frontend: 30 testes unitários Vitest (+9).

**Por quê:** o pedido foi explícito em criar uma experiência "parecida com um aplicativo de viagem"
que responda rapidamente "onde eu preciso estar e o que tenho para fazer" — uma timeline dia a dia
construída 100% a partir de dado real (nunca um horário inventado, mesmo quando isso significa
mostrar "horário a confirmar" em vez de preencher um campo) é o que torna essa resposta confiável, e
a disciplina desta conversa de sempre verificar em navegador de verdade foi o que revelou o caso de
borda do "Dia -1" antes de qualquer usuário real ver algo pior que isso.

<!-- Novas entradas são adicionadas ao final, em ordem cronológica, cada uma com data, "O quê" e "Por quê". -->
