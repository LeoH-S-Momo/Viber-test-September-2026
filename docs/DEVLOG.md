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

<!-- Novas entradas são adicionadas ao final, em ordem cronológica, cada uma com data, "O quê" e "Por quê". -->
