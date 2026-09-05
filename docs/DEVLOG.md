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

## 2026-09-04 — Portal do organizador: dashboard, catálogo, reservas e isolamento multi-tenant

**O quê:** implementado o painel completo do organizador — Dashboard, Cruzeiros, Navios, Eventos,
Restaurantes, Experiências, Reservas, Passageiros e Relatórios — com garantia de isolamento
multi-tenant aplicada no backend e testada explicitamente. Racional completo em
[ADR-0016](architecture/decisions/0016-organizer-portal.md).

**Isolamento sempre por construção da query, nunca por filtro depois:** toda rota nova filtra por
`organizerId` diretamente no `where` do Prisma (`cruise: { organizerId }`) — um `cruiseId` de outro
organizador passado como filtro nunca "vaza" dados, a condição combinada simplesmente não bate com
nada. `OrganizersService.getDashboard` leva isso ao extremo: a lista de cruzeiros usada em toda
consulta subsequente vem sempre de `organizerId`, nunca de um id cru da query.

**Dashboard com as dez métricas pedidas:** receita, reservas (total e confirmadas), ocupação geral e
por categoria de cabine, passageiros, ticket médio, cancelamentos, vendas por período (agrupado por
dia de `confirmedAt`), eventos e experiências mais procurados (via `groupBy` do Prisma). Filtro por
cruzeiro e por período (presets de 30/90/365 dias ou tudo).

**Backend novo:** `GET /organizers/me/{ships,events,restaurants,experiences,bookings,passengers,dashboard,cruises/:id}` —
reutilizando os services do catálogo já existentes (`ShipsService.findMany` já suportava filtro por
organizador; `EventsService`/`RestaurantsService`/`ExperiencesService` ganharam `findManyForOrganizer`
novo; reservas/passageiros são inteiramente novos, antes só existiam como `/bookings/me` do próprio
passageiro).

**Gráficos com a skill de visualização de dados:** `recharts` novo no frontend — um eixo só por
gráfico, barra empilhada de duas séries com legenda para ocupação (Reservado/Disponível), ranking
horizontal de série única para eventos/experiências mais procurados. A paleta de marca (`brand-*`,
um teal desaturado) não passou no piso de croma do validador da skill para uso em gráfico — cores
específicas de gráfico foram escolhidas em vez disso, mantendo `brand-*`/`accent-*` só na UI (botões,
badges).

**Formulário real de criar/editar cruzeiro:** o único form explicitamente pedido — navio, título,
tema, datas, portos, mais um painel de preço por categoria de cabine e publicar/despublicar (sem
isso o organizador nunca tiraria um cruzeiro novo do rascunho, já que a criação não aceita preço).
Navios/Eventos/Restaurantes/Experiências também ganharam formulário de criação (não só leitura) —
necessário para o organizador conseguir popular o catálogo por trás dos cruzeiros.

**Testes de autorização multi-tenant:** `organizer-portal.e2e-spec.ts` (30 testes, novo) — dois
organizadores completos (A e B), provando que A nunca vê as sete listas "minhas coisas" nem o
dashboard de B, mesmo passando o `cruiseId` de B como filtro (sempre 404). Também estendeu cobertura
para rotas de escrita do catálogo que já tinham a checagem de posse no código mas nunca tinham sido
testadas isoladamente (Decks, CabinCategories, Cabins, Venues). Total API: 30 testes novos de
integração (85 → 115 no total, 11 suítes — confirmado rodando contra infraestrutura real).

**Infraestrutura local reconstruída do zero (fora do escopo do código, mas registrado por ser
relevante para próximas sessões nesta máquina):** ao retomar a sessão, Postgres/Redis não estavam
mais acessíveis (nem Docker, nem WSL, nem instalação nativa encontrada). Resolvido instalando
PostgreSQL 17 nativo via `winget` (funcionou de primeira) — o instalador MSI do Redis-compatível
Memurai falhou (`SFXCA: Failed to create temp directory. Error code 5`, `icacls` confirmou que
`C:\Windows\Temp` está com ACL quebrada nesta máquina, bloqueando qualquer instalador MSI baseado em
WiX/custom actions), contornado com um build portátil de Redis para Windows (zip, sem instalador,
`tporadowski/redis` 5.0.14.1) rodando direto via `redis-server.exe`. Criado o usuário/banco
`seapass` afrouxando `pg_hba.conf` para `trust` temporariamente (autorizado explicitamente pelo
usuário) e restaurado para `scram-sha-256` logo em seguida, confirmado com uma tentativa de conexão
sem senha falhando depois da restauração. Com a infra de pé, a suíte de integração completa rodou
100% (115 testes, 11 suítes — 85 já existentes + 30 novos desta etapa, isolamento multi-tenant
incluso), com BullMQ avisando (não falhando) sobre a versão antiga do Redis portátil
(recomendação: 6.2+, esta é 5.0.14.1) — nenhum teste foi afetado por isso.

**Verificação visual real, com dados de verdade:** organizador com navio (10 cabines em 2
categorias), cruzeiro publicado, evento, restaurante, experiência e 3 passageiros com reservas
confirmadas, semeados via API. Dashboard mostrando números reais (receita R$ 11.280, 3 reservas,
30% de ocupação, ticket médio R$ 3.760) com os gráficos renderizando proporcionalmente corretos
(confirmado inspecionando os `<rect>` do SVG, não só o olho — a diferença de altura entre
Deluxe 40% e Standard 20% de ocupação bate exatamente com o que a tabela de Relatórios mostra).
Edição de cruzeiro testada de ponta a ponta: o título mudou no formulário, o `PATCH` foi conferido
direto no banco (`UPDATE ... SET title = 'Cruzeiro Costa Dourada (Editado)'`), e a mudança apareceu
tanto na lista de Cruzeiros quanto na coluna "Cruzeiro" da tela de Reservas — a mesma reserva vista
de dois ângulos diferentes do painel. Todas as 8 páginas restantes (novo cruzeiro, navios, eventos,
restaurantes, experiências, reservas, passageiros, relatórios) carregaram com o conteúdo esperado,
sem erro de console além do 401 já conhecido do refresh silencioso antes do login.

**Infra registrada como serviço do Windows, não mais um processo manual:** o Redis portátil (que
tinha subido como processo solto em background) foi reinstalado como serviço de verdade
(`redis-server.exe --service-install`, nome do serviço "Redis", início automático) — junto com o
Postgres (já um serviço desde a instalação via `winget`), ambos agora sobrevivem a um reboot sem
precisar de nenhuma ação manual numa próxima sessão. Documentado em
`.claude/skills/seapass-local-infra/SKILL.md` para a próxima sessão nesta máquina não precisar
redescobrir nada disso (nem reinstalar o Memurai, que continua falhando por causa da ACL quebrada
em `C:\Windows\Temp`).

**Por quê:** o pedido foi explícito em garantir isolamento de dados no BACKEND (não só no frontend)
e em criar testes para autorização multi-tenant — a mesma disciplina desta conversa (nunca confiar
numa leitura solta seguida de filtro, sempre embutir a condição de posse na própria consulta) foi
reaplicada aqui, agora provada com dois organizadores reais e não só um.

## 2026-09-04 — Logout volta pra tela inicial, e-mail no header, nova paleta de cores

**Logout redireciona pra home:** o botão "Sair" só limpava a sessão, sem navegar — numa página
protegida (`<RequireRole>`), isso deixava o usuário preso na tela de "Redirecionando…". Corrigido
com um recarregamento completo (`window.location.href = '/'`) em vez de `router.push` — o efeito
de `RequireRole` (que também reage a `user` virar `null` e chama `router.replace('/login')`) sempre
venceu uma navegação client-side concorrente nos testes, não importa a ordem ou um `setTimeout(0)`
entre as duas chamadas; só um reload de verdade resolveu de forma confiável.

**E-mail do usuário logado no header:** adicionado entre os links de navegação e o botão "Sair"
(`apps/web/src/components/auth-nav.tsx`), visível a partir de telas ≥640px.

**Nova paleta de cores — "céu e mar":** trocada a paleta inteira do site pela publicada em
[colorhunt.co/palette/30afff92eeffd8ffc5c4f7ca](https://colorhunt.co/palette/30afff92eeffd8ffc5c4f7ca)
(pedido explícito do usuário). Os dois degradês de token (`brand`/azul, `accent`/verde, 10-11 tons
cada) foram regerados por HSL a partir das 4 cores da paleta — `brand-500` é literalmente `#30AFFF`,
`accent-100`/`200` ficam próximos de `#D8FFC5`/`#C4F7CA` — com contraste WCAG AA verificado
(`accent-600`, usado em todo botão "primary", passou de 3.39:1 pra 4.79:1 depois de três ajustes de
luminosidade). Só `apps/web/src/app/globals.css` mudou — nenhum componente hardcodeia hex da
paleta antiga. Racional completo, incluindo a tabela de contraste, em
[ADR-0017](architecture/decisions/0017-color-palette.md).

**Por quê:** pedidos diretos de UX/marca — a mesma disciplina de sempre verificar em navegador real
(não só confiar no código) foi o que revelou que a correção óbvia do logout (`router.push` depois
de `logout()`) simplesmente não funcionava, e o que confirmou visualmente que a nova paleta ficou
coerente em todas as áreas do site (pública, passageiro, organizador) antes de considerar o pedido
atendido.

## 2026-09-04 — Painel administrativo global (PLATFORM_ADMIN)

**O quê:** implementado o painel administrativo global pedido explicitamente pelo usuário — acesso
restrito a `PLATFORM_ADMIN`, 13 módulos (usuários, organizadores, cruzeiros, navios, cabines,
reservas, pagamentos, eventos, restaurantes, experiências, cupons, tickets, check-ins), cada um com
listagem, busca, filtros, paginação, detalhes e ações administrativas, mais uma área de auditoria.

**Backend:**
- 5 controllers/services novos em `apps/api/src/modules/admin/` (`AdminUsersService`,
  `AdminCatalogService`, `AdminSalesService`, `AdminCouponsService`, e o `AdminService` original
  estendido com organizadores paginados/filtrados) — todos leem `PrismaService` direto, não os
  services do catálogo do organizador (que carregam checagem de posse irrelevante pra um admin
  global). Contratos Zod novos em `packages/contracts/src/admin/admin.schema.ts`.
- Retrofit de auditoria em toda a aplicação, não só nas rotas novas: `CruisesService`,
  `ShipsService`, `EventsService`, `RestaurantsService`, `ExperiencesService` (criação/alteração/
  publicação), `BookingsService.cancelBooking` (cancelamento) e `TicketsService.confirmCheckIn`
  (alteração de status) agora chamam `AuditLogService.record(...)` depois de cada mutação, via um
  parâmetro `actorUserId?` opcional (deliberadamente opcional — evita reescrever toda suíte de
  testes unitários que já instanciava esses services sem esse argumento).
- `Coupon` ganhou seu primeiro CRUD HTTP (só existia usado internamente no checkout até agora).
- Cancelamento administrativo de reserva reaproveita `TicketsService.cancelTicketsForBooking` — o
  mesmo método que o cancelamento do próprio passageiro já usa, garantindo que tickets emitidos são
  invalidados também quando é um admin que cancela.
- Bug real encontrado escrevendo os testes de integração: `AdminCouponsQuerySchema.isActive` usava
  `z.coerce.boolean()`, que trata `"false"` como `true` (qualquer string não-vazia é truthy em JS)
  — o filtro de cupons inativos estava silenciosamente quebrado. Corrigido com um enum explícito.
- `test/integration/admin.e2e-spec.ts` (novo, 16 casos): RBAC nas 15 famílias de rota, os 13
  módulos fim-a-fim, o cancelamento em cascata do ticket, e a auditoria (actor/ação/entidade/
  timestamp corretos) inclusive dos filtros e paginação de `GET /admin/audit-logs`. Suíte de
  integração completa (131 testes) e unitária (248 testes) verde, typecheck e lint limpos.

**Frontend:** painel completo em `apps/web/src/app/(admin)/admin/` (14 páginas — 13 módulos +
auditoria), com sidebar própria e `RequireRole` no layout (não por página, já que as 14 exigem o
mesmo papel). Dois hooks novos (`useAdminList`, `useAdminDetail`) carregam o padrão repetido de
filtro+paginação e de "modal de detalhes por id" nas 13 páginas, evitando reimplementar o mesmo
`useState`/`useEffect` catorze vezes. `Modal` (novo componente compartilhado), `AdminPagination` e
`AdminActionButton` (confirma via `window.confirm`/`window.prompt`, chama a API, recarrega a lista)
completam as peças reaproveitadas pelos 13+1 módulos. Cupons é o único módulo com formulário de
criação/edição completo (os outros 12 são leitura + uma ação de status). `auth-nav.tsx` e
`login/page.tsx` ganharam o branch de `PLATFORM_ADMIN` (link "Painel Admin" no header,
redirecionamento pós-login pra `/admin/usuarios`). `authFetchJson`/`qs` foram promovidos de dentro
de `organizers.service.ts` para `lib/api-client.ts`, compartilhados agora pelos dois services.
Build de produção (`next build`) gera as 14 rotas sem erro; typecheck e lint limpos.

Racional completo (arquitetura Prisma-direto, técnica do parâmetro opcional, o bug do
`z.coerce.boolean()`, as escolhas do frontend) em
[ADR-0018](architecture/decisions/0018-admin-panel.md).

**Por quê:** pedido explícito do usuário, incluindo o requisito específico de que a auditoria
armazene informação suficiente para responder quem fez, o que fez, quando fez e qual recurso foi
afetado — daí o retrofit cobrir a aplicação inteira (não só as 13 rotas novas do painel), já que
"registre operações sensíveis como criação, alteração, exclusão, publicação, cancelamento,
alteração de status" descreve ações que já existiam em outros módulos antes desta tarefa.

## 2026-09-04 — Catálogo de demonstração com 6 cruzeiros temáticos

**O quê:** o seed (`apps/api/src/database/prisma/seed.ts`) criava só um cruzeiro de demonstração
("Rock in Sea — Clássicos do Rock"). A pedido do usuário, virou seis, cada um com um tema e nome
específicos, e uma descrição de 5-6 frases coerente com o tema (mesmo estilo/tamanho do exemplo que
o usuário deu para o cruzeiro de heavy metal):

- **Heavy Metal do Leo Sensations** (Heavy Metal) — o cruzeiro original renomeado no lugar (mesmo
  `id`, preservando reservas/tickets de demonstração já existentes); os 4 eventos e a experiência de
  percussão também foram renomeados para caber no tema (ex.: "Roda de Violão Acústica" →
  "Oficina de Riffs — Guitar Clinic Metal"; "Show Acústico — Bossa Rock" → "Unplugged Metal Night"),
  e as duas bandas fictícias (`seedVenuesArtistsRestaurants`) ganharam bio de cover de heavy metal.
  Descrição usada é o texto exato fornecido pelo usuário.
- **Marcello Nicolielo apresenta: Só as melhores** (Pop/Rock — Grandes Sucessos)
- **Paulo Sudré e os Mutantes agitam o salão** (Tropicália e Baile Retrô)
- **Pagodão com Thácio Moraes** (Pagode)
- **Claude beats (24h non-stop Techno)** (Techno)
- **The Amazing Gemini and the Copilots** (Glam Rock / Space Pop)

Os 5 novos cruzeiros reaproveitam o mesmo navio/organizador (Rock in Sea, MS Harmonia das Ondas) e o
itinerário padrão de 5 dias (Santos → Ilha Grande → Búzios → dia de mar → Santos), cada um com datas
de embarque escalonadas entre nov/2026 e abr/2027 e preço por categoria de cabine próprio — sem
réplica dos eventos/experiências/reservas de demonstração, que continuam concentrados só no cruzeiro
principal (heavy metal).

**Detalhe técnico:** o `cruise.upsert` (e o rename dos 4 eventos/1 experience do cruzeiro principal)
casa o `where` pelo *slug/título antigo* e escreve o novo no `update` — renomeia a linha já existente
em bancos que já tinham rodado o seed antes, em vez de criar uma segunda linha duplicada com o slug
novo. Confirmado rodando `pnpm db:seed` duas vezes seguidas e checando via `GET /cruises` que só
existe uma linha por cruzeiro (nenhum "Rock in Sea — Clássicos do Rock" órfão).

**Por quê:** pedido explícito do usuário — trocar os nomes dos cruzeiros mockados por nomes
específicos (a maioria referências pessoais/em tom de brincadeira) e dar a cada um uma descrição
coerente com seu tema, seguindo o padrão de texto do exemplo de heavy metal fornecido.

## 2026-09-04 — Limpeza dos cruzeiros de teste no banco de dev

**O quê:** o banco de dev tinha 96 cruzeiros: os 7 reais (os 6 renomeados no item acima + "Cruzeiro
Costa Dourada (Editado)") e 89 sobras de rodadas de `pnpm test:integration` — cada suíte de e2e cria
seus próprios navio/organizador/cruzeiro com um sufixo `<label>-<timestamp>-<hash>` (helper `unique()`
usado em `rbac.e2e-spec.ts`, `catalog.e2e-spec.ts`, etc.) contra esta mesma base, sem limpar depois.
A pedido do usuário, removidos via script pontual (não versionado, rodado direto contra o banco):
todo cruzeiro cujo título contém uma sequência de 6+ dígitos (o timestamp) foi deletado — as 89 sobras
batem 100% nesse padrão, os 7 reais não têm dígito nenhum no título.

Cada cruzeiro deletado teve suas reservas apagadas primeiro (`Booking.cruise` é `onDelete: Restrict`
no schema — apagar o cruzeiro direto teria falhado com FK violation enquanto houvesse reserva presa
a ele); o cascade do Prisma cuidou do resto (hóspedes, tickets, check-ins, pagamentos, itinerário,
preço por cabine, eventos, experiências). 374 reservas removidas em cascata junto dos 89 cruzeiros.
Catálogo público (`GET /cruises`) confirmado com só os 7 restantes depois da limpeza.

**Por quê:** pedido explícito do usuário — o catálogo estava poluído com dezenas de cruzeiros de
teste ("Navio de Teste", títulos cheios de número) atrapalhando a visualização dos cruzeiros
temáticos de verdade. Nota: "Cruzeiro Costa Dourada (Editado)" foi mantido por não bater em nenhum
dos dois critérios pedidos (nem "Navio de teste", nem título com número), embora pareça ser sobra de
teste também (organizador "Organizer portalcheck1788520121639") — vale confirmar com o usuário se
deve sair numa próxima limpeza.

## 2026-09-04 — Eventos de domínio/aplicação + infraestrutura de notificações

**O quê:** implementada a infraestrutura completa de eventos e notificações pedida explicitamente
pelo usuário. Duas camadas, com propósitos deliberadamente diferentes (ver
[ADR-0019](architecture/decisions/0019-events-and-notifications.md)):

- **Eventos de domínio** (`EventEmitter2`, síncrono, in-process, `src/domain-events/`): 9 eventos —
  os 8 do pedido (`BOOKING_CREATED`, `BOOKING_CONFIRMED`, `BOOKING_CANCELLED`, `PAYMENT_APPROVED`,
  `PAYMENT_FAILED`, `TICKET_GENERATED`, `CHECKIN_COMPLETED`, `EVENT_BOOKED`) mais `EVENT_UPDATED`
  (novo, necessário pra "alteração de evento" ter de onde nascer). Emitidos por `BookingsService`,
  `TicketsService`, `ActivitiesService`, `EventsService` (catálogo) e `AdminSalesService` — nenhum
  deles sabe que `NotificationsModule` existe.
- **Fila de notificações** (`BullMQ`, `NotificationsModule`, auto-contido): traduz os eventos que
  viram notificação (nem todos viram — `BOOKING_CREATED`/`CHECKIN_COMPLETED`/`EVENT_BOOKED` ficam
  sem e-mail hoje, de propósito) nas 7 notificações pedidas: confirmação de reserva, pagamento
  aprovado, pagamento recusado, ticket disponível, lembrete de embarque, alteração de evento,
  cancelamento. Cada uma grava uma linha `Notification` (auditável, consultável via
  `GET /notifications/me`) e só então enfileira o envio do e-mail de verdade.

**Retry, idempotência, dead-letter:** fila `notifications` com `attempts: 5` + backoff exponencial
(3s→48s); idempotência em duas camadas (jobId determinístico + checagem de `deliveryStatus` antes
de reenviar — e o mesmo princípio replicado em `TicketsService.issueTicketsForBooking`, que só
dispara `TICKET_GENERATED` se o número de tickets já emitidos antes da chamada for menor que o de
hóspedes, pra um retry do BullMQ não reenviar "seu ingresso está pronto" à toa); quando as 5
tentativas se esgotam, o job cai numa fila `notifications-dead-letter` separada (visível via
Redis/BullMQ) + a `Notification` vira `FAILED` + um `AuditLog`.

**Pagamento recusado vs. cancelamento — deliberadamente 2 notificações separadas, nunca as duas
juntas:** quando um pagamento é recusado, o sistema já cancela a reserva automaticamente (libera a
cabine) — mas emitir `BOOKING_CANCELLED` ali mandaria um segundo e-mail redundante/confuso logo
depois de "pagamento recusado". `BOOKING_CANCELLED` fica reservado só pro cancelamento explícito
(passageiro ou admin). Verificado na prática (ver testes abaixo): o cenário de recusa gera só
`PAYMENT_DECLINED`, nunca os dois juntos.

**Lembrete de embarque** é o único gatilho por TEMPO, não por evento — reusa o mesmo padrão de job
BullMQ atrasado que `CABIN_HOLD_EXPIRATION_QUEUE` já usava (ADR-0009), agendado quando
`BOOKING_CONFIRMED` dispara, e reconfirmando que a reserva ainda está `CONFIRMED` quando o delay
vence antes de gerar a notificação (a reserva pode ter sido cancelada nesse meio-tempo).

**MailHog em dev:** binário Windows portátil (`C:\Users\Leo\mailhog\MailHog.exe`, sem instalador —
mesma razão de não usar `winget` que motivou o Redis portátil nesta máquina, ver skill de infra),
SMTP `:1025`, UI web `http://localhost:8025`. Diferente de Postgres/Redis, não virou serviço
Windows — não guarda nada que precise sobreviver a um reboot, então um processo em segundo plano
reiniciado por sessão é suficiente (documentado em
`.claude/skills/seapass-local-infra/SKILL.md`, seção 1b, nova). Em CI, `mailhog/mailhog` foi
adicionado como serviço Docker em `infra/docker-compose.test.yml` (portas 1026/8026, offset do
padrão pelo mesmo motivo que Postgres/Redis de teste já usavam portas diferentes — não conflitar
com uma instância local rodando em paralelo).

**Testado contra infraestrutura real, não mockada:** `test/integration/notifications.e2e-spec.ts`
(4 casos) roda o fluxo completo — registro, hold, checkout — e depois consulta a própria API REST
do MailHog (`GET /api/v2/messages`) pra confirmar que o e-mail chegou de verdade, não só que o job
rodou sem lançar erro; cobre o caminho feliz (3 notificações da reserva confirmada com PIX),
pagamento recusado, cancelamento explícito, e a paginação/autenticação de `GET /notifications/me`.
Mais 9 testes unitários novos pro `NotificationsProcessor` (idempotência, dead-letter, job
desconhecido). Suíte completa: 257 unitários + 135 integração, todos verdes.

**O que ficou síncrono e o que ficou assíncrono, e por quê** (pedido explícito do usuário — ver a
seção dedicada da ADR): a emissão do evento em si e a gravação da linha `Notification` continuam
síncronas (chamada de função em memória + um insert local no mesmo Postgres da request — não valia
a pena adiar algo tão barato); só o ENVIO do e-mail (I/O de rede pra um SMTP externo, que pode ser
lento ou falhar) vai pra fila. Continuam também síncronos todos os fluxos que já eram antes desta
mudança (validação, `PaymentGateway.charge()` — o usuário ainda precisa saber na hora se o cartão
foi aprovado).

**Por quê:** pedido explícito e detalhado do usuário, incluindo a instrução direta de não
transformar tudo em assíncrono sem necessidade e de explicar a divisão — daí o cuidado extra em
justificar cada escolha síncrono/assíncrono na ADR em vez de só implementar.

## 2026-09-04 — Hardening completo: segurança, backend, frontend, testes, DevOps

**O quê:** revisão completa do SeaPass "como se fosse um projeto prestes a ser avaliado por uma
equipe profissional", pedida explicitamente pelo usuário, cobrindo segurança, backend, frontend,
testes e DevOps — com instrução de corrigir, não só listar. Detalhe completo em
[ADR-0020](architecture/decisions/0020-hardening.md); resumo aqui.

**Segurança (corrigido):** cupom redimível em cruzeiro de outro organizador (Alto — escopo de
`organizerId` era descartado antes mesmo de chegar na política de validação); `Artist` (dado de
referência compartilhado entre organizadores) editável por qualquer organizador, sem checagem de
posse (Médio); JWT/cookie de sessão gravados em texto puro em todo log (Crítico — o redact
configurado mirava `req.body`, que o serializer padrão do pino nunca inclui, e não cobria
`req.headers`); segredos JWT sem piso de força mínimo (Alto — 1 caractere era aceito); nenhum rate
limiting em nenhum endpoint (Alto); nenhum header de segurança (`helmet`) (Alto); Swagger exposto
incondicionalmente, inclusive em produção (Médio). SQL injection, XSS e CSRF verificados e já
estavam corretos (parametrização via Prisma, escape automático do React, `SameSite=Lax` + Bearer
token).

**Backend (corrigido):** filtro global de exceções sem contexto de correlação pra depurar um 500
de produção (Alto); sem rede de segurança contra `unhandledRejection`/`uncaughtException` (Alto);
emissão de ticket sem retry nem visibilidade de falha — um blip de infra na hora certa deixava uma
reserva paga sem ticket, silenciosamente, pra sempre (Alto); cancelamento de cruzeiro pelo admin
não cascateava pra reservas/tickets, nem notificava ninguém (Alto). Concorrência (locks +
transação em todo fluxo crítico), paginação e idempotência já verificados sólidos.

**Frontend (corrigido):** nenhum fluxo de reserva existia em lugar nenhum do site — o achado mais
crítico da revisão inteira (Crítico). O mapa do navio já tinha o botão "Selecionar cabine"
totalmente construído desde a etapa anterior (comentário no código já avisava: "fornecido pelo
fluxo de checkout, ainda não implementado — ver ADR-0008"), só faltava ligar. Construído
`apps/web/src/features/booking/` (`CabinBookingFlow` + `BookingModal`, máquina de estados
hold → hóspedes → pagamento → confirmação), 4 novas funções em `bookings.service.ts`
(`holdCabin`/`updateBookingDetails`/`checkoutBooking`/`releaseHold`), suporte a
`?redirect=` no `/login` (só aceita caminho interno — nunca um open redirect) pra devolver o
usuário à página do cruzeiro após logar, e o botão morto "Consultar" de `CruiseCabins` virou um
link real até o mapa. Também corrigidos: sessão expirava de vez após 15min sem nenhum aviso (Alto
— renovação silenciosa proativa a cada 10min + ao voltar o foco da aba); botão "Tentar novamente"
de erro não fazia nada em nenhuma tela client-side (Alto — `router.refresh()` só re-executa dados
de Server Component). Verificado de ponta a ponta num browser real via Playwright — login, mapa,
hold, hóspedes, pagamento PIX, confirmação, chegada em "Minha viagem" (`/reservas`, já existente e
rica, só faltava uma reserva `CONFIRMED` de verdade pra mostrar).

**DevOps (corrigido):** Dockerfiles rodavam como root no estágio de runtime — ganharam `USER
node`; `docker-compose.yml` não tinha o serviço `mailhog` (só existia em
`docker-compose.test.yml`); o job `e2e-tests` do CI nunca subia a API (o próprio comentário do
workflow admitia isso) — reescrito para subir toda a infra, migrar, semear, buildar, iniciar a API
em background e esperar `/health` antes do Playwright rodar; `ship-map.spec.ts` apontava pro slug
do cruzeiro antes da renomeação (pulava silenciosamente desde então).

**Testes:** `coupon.policy.spec.ts` (regra de organizador), `rbac.e2e-spec.ts` (2 casos novos:
Artist entre organizadores, cupom cross-organizador), `admin.e2e-spec.ts` (cascade de
cancelamento), `env.schema.spec.ts` (piso de segredo, `sslmode` em produção), e o novo
`booking-flow.spec.ts` (Playwright, 2 casos: fluxo completo de reserva de ponta a ponta e cupom
inválido tratado sem quebrar a tela). Suíte final: 263 unitários + 138 integração (API) + 30
unitários (web) + 10 E2E (Playwright) — todos verdes; `typecheck`/`lint` limpos nos dois apps.

**Nota sobre o dev DB compartilhado:** verificar o fluxo de reserva em browser real expôs (não
causou) uma característica do ambiente local: sem um banco de teste separado nesta máquina, cada
execução de spec de integração/E2E consome cabines de verdade do cruzeiro-alvo, e a leitura do
mapa fica em cache por 30s (`revalidate: 30` em `safeFetchJson`) — rodar o mesmo spec várias vezes
em sequência rápida contra o mesmo cruzeiro pode ver um retrato defasado e esbarrar num 409 de
concorrência legítimo. `booking-flow.spec.ts` já lida com isso (retry pra próxima cabine
disponível, um cruzeiro por teste); reservas HELD/PAYMENT_PENDING abandonadas por execuções
repetidas foram limpas do dev DB ao final desta sessão.

**Por quê:** pedido explícito e extenso do usuário — auditoria completa antes de uma avaliação
profissional, com instrução direta de corrigir (não só listar) e de fechar com um relatório do que
foi melhorado.

## 2026-09-05 — Revisão geral noturna: bugs encontrados e corrigidos (sem supervisão)

**O quê:** pedido explícito do usuário pra rodar sem pedir autorização durante a noite, revisar
o código geral, achar bugs e consertar. Baseline antes de começar: 263 unitários + 138 integração
(API), 30 unitários (web), `typecheck`/`lint` limpos — tudo já verde. Metodologia: 3 agentes de
auditoria somente-leitura em paralelo (backend, frontend, contratos/testes/infra), cada achado
verificado por leitura direta do código antes de corrigir (nenhum "conserto" às cegas).

**Bug no próprio spec de e2e (achado ao rodar a suíte de baseline, três camadas):**
`booking-flow.spec.ts` tinha três problemas empilhados, cada um mascarando o próximo até ser
isolado com um script de depuração dedicado (`page.on('response', ...)` + comparação direta com
`curl` no backend). (1) fixava `count` das cabines "disponíveis" no início do loop e indexava por
`.nth(i)` — fechar o modal de uma tentativa fracassada dispara `router.refresh()`, que pode
encolher essa lista, e o teste esperava por um índice que deixou de existir, travando até o
timeout de 90s; corrigido reconsultando a lista do zero a cada tentativa, marcando rótulos já
tentados num `Set`. (2) um seletor `[aria-label*="disponível"]` casava por engano com
"indisponível" (contém "disponível" como substring) — trocado por `$=` (termina com). (3) o mais
sutil: `router.refresh()` é um refresh CLIENT-SIDE (Router Cache/Data Cache do Next) — chamado
repetidas vezes em sequência rápida dentro da MESMA instância de página (o padrão "fecha o modal
e tenta a próxima cabine"), ele não garantia dado fresco a tempo da leitura seguinte: o rótulo de
uma cabine recém-reservada continuava dizendo "disponível" por mais uma ou duas tentativas,
fazendo o teste reincidir na mesma cabine já presa (409 legítimo, mas testando a cabine errada) em
vez de progredir — confirmado comparando `curl` direto no backend (sempre correto) contra o que a
página realmente renderizava (defasado). Corrigido trocando a estratégia de retry: cada tentativa
agora faz um `page.goto` novo (reload completo, sempre busca a Server Component do zero) em vez de
reusar a mesma instância de página entre tentativas.

**Segurança — Crítico: token de recuperação de senha logado em texto puro em produção.**
`AuthService.forgotPassword` gravava o token cru (a credencial que dá acesso total à troca de
senha) em todo `POST /auth/forgot-password`, em qualquer ambiente, sem o guard de `NODE_ENV` que
o controller já tinha pro campo `devToken` da resposta — mesma classe de bug do JWT/cookie em log
já corrigida numa revisão anterior (ver ADR-0020), só que pra este segredo específico. Corrigido
com o mesmo guard; teste de regressão adicionado.

**Backend — Alto: cancelar uma reserva nunca cancelava suas reservas de evento/restaurante.**
`BookingsService.cancelBooking`, `AdminSalesService.cancelBooking` e
`AdminCatalogService.cancelCruise` cancelavam a `Booking` e seus `Ticket`s mas nunca tocavam
`EventReservation`/`DiningReservation` — elas ficavam `CONFIRMED` presas pra sempre, continuando
a contar contra a capacidade do evento/horário mesmo com a viagem cancelada (o espelho invertido
do cuidado que o código já tem contra overbooking). Corrigido nos 3 pontos, em bulk
(`updateMany`, não um loop), na mesma transação do cancelamento. Coberto por um novo teste de
integração de ponta a ponta (reserva + evento + jantar → cancela a reserva → confirma as duas
capacidades liberadas).

**Contratos — Alto: dois `Update*Schema` perdiam a checagem de ordem de data num PATCH parcial.**
`UpdateCouponSchema` e `UpdateCruiseSchema` só rejeitavam `validFrom > validUntil` (ou
`embarkationDate`/`disembarkationDate`) quando os DOIS campos vinham juntos no mesmo PATCH — Zod
não tem como comparar contra o valor já salvo do campo que faltou no body. Um PATCH parcial
(`{ validFrom: "2030-01-01" }` num cupom cujo `validUntil` já era antes disso) passava sem erro
nenhum e tornava o cupom permanentemente irredimível (`CouponPolicy.validate` nunca acha um `now`
que satisfaça nenhum dos dois lados). Mesma falha, gravidade menor, em cruzeiros. E `Event.startAt`/
`endAt` nunca era validado em lugar nenhum, nem no create. Corrigido: `CreateEventSchema` e
`UpdateEventSchema` ganharam o mesmo `.refine()` que `CreateCruiseSchema` já tinha;
`AdminCouponsService.update`, `CruisesService.update` e `EventsService.update` ganharam um
backstop que revalida o par MERGED (input ou valor existente) antes de escrever — a única forma
de fechar o buraco do PATCH parcial, já que o Zod sozinho não alcança o banco. Testes de
regressão novos para os 3.

**Frontend — Alto: renovação de sessão concorrente podia derrubar uma sessão legítima.** O
intervalo de 10min e o listener de `visibilitychange` (ambos em `auth-context.tsx`) podiam
disparar `POST /auth/refresh` quase juntos com o MESMO cookie. O backend rotaciona o refresh
token a cada uso e trata um token já revogado como possível roubo, revogando TODOS os tokens do
usuário (`TokensService.rotateRefreshToken`) — duas chamadas concorrentes da mesma sessão
legítima acionavam exatamente essa defesa contra si mesmas, deslogando o usuário no meio do uso.
Corrigido com um guard de "renovação em voo": a segunda chamada reusa a `Promise` da primeira em
vez de disparar uma segunda request.

**Frontend — Alto: fechar o modal de reserva na tela de pagamento não liberava a cabine.** O hold
só era liberado se `step.name === 'guests'` — mas a reserva continua `HELD` até o checkout rodar
de fato (só vira `PAYMENT_PENDING`/`CONFIRMED` dentro de `checkout()`), então abandonar na tela de
pagamento (o ponto de desistência mais comum: comparar formas de pagamento e sair) deixava a
cabine presa até a expiração do hold, contrariando o próprio comentário do código. Corrigido:
guard ampliado pra `'guests' || 'payment'`.

**Frontend — Médio/Baixo, também corrigidos:** mapa do navio mostrava disponibilidade
CONGELADA no momento do clique (o painel de detalhe guardava o objeto cheio, não um id — depois
de reservar uma cabine e o `router.refresh()` trazer dado novo, o painel continuava mostrando a
cabine recém-reservada como disponível); mensagem de sucesso do pagamento dizia "(boleto)" pra
QUALQUER `PAYMENT_PENDING`, mesmo PIX/cartão que deram timeout no gateway; cancelar uma reserva de
evento/restaurante que falhasse (ex.: fora do prazo) não mostrava erro nenhum, só revertia o
spinner silenciosamente; `useAdminDetail` não tinha a mesma proteção contra resposta fora de
ordem que `useAdminList` já tinha.

**Testado:** suíte completa depois de todas as correções — 274 unitários + 141 integração (API,
+11/+3 dos novos testes de regressão), 30 unitários (web), `typecheck`/`lint` limpos nos dois
apps, suíte E2E completa (Playwright) incluindo `booking-flow.spec.ts` de ponta a ponta num
browser real (2 casos, ambos verdes de forma consistente depois do fix descrito acima). Reservas
HELD/PAYMENT_PENDING abandonadas por execuções repetidas de teste foram limpas do dev DB
compartilhado várias vezes ao longo da sessão (mesma característica do ambiente já registrada na
entrada de hardening anterior). No meio da depuração do bug do `router.refresh()`, os dev servers
de `api` e `web` (rodando continuamente há muitas horas, sob carga pesada desta própria sessão)
foram reiniciados como parte da investigação — descartado como causa raiz depois (o problema era
mesmo o refresh client-side), mas mantido como uma reinicialização limpa saudável de qualquer
forma.

**Por quê:** pedido explícito do usuário — revisão geral autônoma, sem pedir permissão, achando e
corrigindo bugs de verdade (não apenas listando), com o projeto rodando sem supervisão durante a
noite.

## 2026-09-05 — Auditoria final de Staff Engineer + documentação profissional

**O quê:** pedido explícito do usuário — revisão final do projeto "como se fosse avaliado por uma
equipe profissional", com instrução de corrigir (não só listar), sem inventar complexidade nova.
Metodologia: 3 agentes de auditoria em paralelo (backend, frontend, DevOps/testes/docs), cada um
instruído a NÃO repetir achados já corrigidos nas duas rodadas de hardening anteriores (ver
ADR-0020 e as duas entradas de DEVLOG de 2026-09-04/05) — o foco desta vez era arquitetura,
organização de módulos, duplicação, nomes inconsistentes, abstrações desnecessárias e código morto.

**Segurança/autorização — corrigido:** dois módulos (`ActivitiesService.assertShipOwnedByOrganizer`,
`TicketsService.assertBelongsToOrganizer`) lançavam 403 (`ForbiddenException`) para um recurso de
outro organizador, contrariando a regra já documentada em ADR-0005 (404, nunca 403 — não confirmar
existência a quem não é dono). Corrigido nos dois; `lookupForCheckIn` (consulta, não mutação) foi
além — em vez de lançar qualquer exceção, agora trata um ticket de outro organizador exatamente
como um código inexistente (`outcome: INVALID`), consistente com o próprio comentário da função
("nunca lança 404 aqui — é uma consulta"), que a implementação anterior contradizia.

**Banco de dados — corrigido:** `BookingExperience` só tinha `@@unique([bookingId, experienceId])`
— `experienceId` não é a coluna líder desse índice composto, então
`sumActiveExperiencePartySize(Plain)` (hot path de toda leitura de disponibilidade de adicional)
fazia sequential scan. Adicionado `@@index([experienceId])`, mesmo padrão que
`EventReservation`/`DiningReservation` já tinham. Migration `20260905030000_booking_experience_index`.

**Código morto — removido:** 4 diretórios de módulo vazios (`itineraries/`, `cabins/`, `ships/`,
`restaurants/`, só `.gitkeep`) — sobra do scaffolding inicial, superados pela consolidação em
`catalog/`. Duas funções de serviço no frontend (`getEventAvailability`/`getDiningAvailability`)
exportadas mas nunca chamadas em lugar nenhum. Infraestrutura MinIO/S3-compatible inteira (serviço
no Docker Compose dev e em CI, variáveis `STORAGE_*`/`MINIO_*`) e as variáveis `SENTRY_DSN`/
`OTEL_EXPORTER_OTLP_ENDPOINT` — nenhuma tinha um único consumidor real no código (zero uploads de
arquivo implementados, zero integração de Sentry/OTEL), provisionadas desde o início do projeto e
nunca usadas. Documentado honestamente em "Limitações conhecidas" (README) em vez de manter
configuração morta implicando uma funcionalidade que não existe.

**Duplicação de código — corrigido no frontend:** `tickets.service.ts` e `activities.service.ts`
ainda tinham cada um sua própria cópia privada de `authFetchJson`, idêntica à versão compartilhada
em `api-client.ts` — a consolidação do hardening anterior não tinha alcançado esses dois arquivos.
`cruises.service.ts` reimplementava `qs()` (já existente em `api-client.ts`). `PageResult` em
`types/organizer.ts` era um alias puro de `PaginatedResult` sem nenhuma diferença de comportamento
— removido, usa `PaginatedResult` direto (como `admin.service.ts` já fazia).

**Duplicação de código — corrigido no backend:** dois controllers admin (`admin-catalog`,
`admin-sales`) definiam o mesmo schema Zod inline (`{ reason: z.string().max(300).optional() }`)
em vez de importar de `@seapass/contracts` — único lugar do codebase onde isso acontecia. Movido
para `AdminCancelReasonSchema` compartilhado.

**Documentação desatualizada — corrigida:** `apps/api/src/modules/README.md` descrevia módulos
"planejados" que nunca existiram como módulos próprios (`cruises`, `events`, `restaurants` — na
verdade consolidados em `catalog/`) e uma convenção de teste colocalizado que o projeto nunca
seguiu (testes vivem centralizados em `apps/api/test/`). `apps/web/src/hooks/README.md` e
`stores/README.md` descreviam Zustand/TanStack Query — nenhum dos dois é dependência do projeto.
`components/README.md` mandava `PascalCase.tsx` quando todo arquivo real é `kebab-case.tsx`
(exportando um componente `PascalCase` — a convenção real, só nunca documentada certo).
`features/README.md` tinha um exemplo de pastas parcialmente fictício e nenhuma exceção
documentada para `cabin-booking-flow.tsx` importar `ShipMap` de outra feature (uma ponte
deliberada, não uma violação da regra). Todos corrigidos para refletir o código real.

**DevOps — corrigido:** `infra/docker/{api,web}.Dockerfile` não tinham `HEALTHCHECK` (usando
`node -e` contra um módulo `http`, não `curl`/`wget` — nenhum dos dois é garantido em
`node:alpine`). CI: o job `docker-build` só rodava em push pra `main` (uma imagem quebrada só
seria descoberta depois de já ter mergeado) — agora roda em toda PR, e ganhou um smoke test real
(sobe o container da API com credenciais falsas, confirma que ele responde HTTP em vez de só
"buildou"). Teste `health.controller.spec.ts` só verificava que duas funções foram passadas pro
`HealthCheckService`, nunca que eram as funções certas — agora invoca cada uma e confirma que
delega pro indicator certo (Postgres/Redis, na ordem certa).

**Considerado e decidido não fazer (documentado, não esquecido):** extrair um componente genérico
de tabela/modal para as ~14 páginas do painel admin (a duplicação existe, mas cada página difere
o bastante em colunas/ações que a abstração exigiria bastante indireção — sem um terceiro caso
idêntico real, não compensa ainda); separar `OrganizersService` (CRUD de tenant) de um
`OrganizerDashboardService` (analytics) — os dois compartilham `requireOwnedCruise`/
`dateRangeFilter`, e a mistura de responsabilidades, embora real, ainda não atrapalha o suficiente
para justificar a divisão. Ambos documentados em "Limitações conhecidas"/"Próximos passos" no
README, com o raciocínio explícito de por que não agora.

**Documentação final:** README.md reescrito por completo — Visão geral, Problema, Solução,
Funcionalidades, Arquitetura, Stack, Decisões arquiteturais (linkando os 20 ADRs relevantes),
Modelagem, Fluxo de reserva, Estratégia contra overbooking, Autenticação e autorização, Pagamentos,
Eventos assíncronos, Testes, Segurança, Observabilidade, como rodar localmente/testes/Swagger,
Variáveis de ambiente, Usuários de demonstração, Estrutura do projeto, Limitações conhecidas,
Próximos passos, e uma seção nova "Decisões técnicas que eu explicaria em uma entrevista" (20
decisões, cada uma com o trade-off real por trás). Corrigida a alegação obsoleta de que
notificações estavam "fora de escopo" (implementadas há duas revisões, ver ADR-0019) e a falta de
qualquer menção ao painel admin/hardening no README anterior.

**Testado:** suíte completa depois de todas as correções — 274 unitários + 141 integração (API),
30 unitários (web), `typecheck`/`lint` limpos nos dois apps.

**Por quê:** pedido explícito do usuário — auditoria final por um "Staff Engineer" antes de
apresentar o projeto num processo seletivo, com instrução direta de corrigir incrementalmente
(nunca reescrever o que já funciona) e documentar de forma profissional o resultado.

<!-- Novas entradas são adicionadas ao final, em ordem cronológica, cada uma com data, "O quê" e "Por quê". -->
