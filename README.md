# SeaPass

Plataforma de comercialização e gestão de cruzeiros temáticos — teste técnico para a vaga de
desenvolvedor(a) pleno(a).

## Visão geral

SeaPass é um marketplace de dois lados: **produtoras independentes** ("organizadores") publicam
cruzeiros temáticos (rock, techno, pagode, stand-up...) com navio, cabines, itinerário, eventos,
restaurantes e experiências; **passageiros** navegam o catálogo, reservam uma cabine, pagam,
recebem um ingresso digital com QR Code e organizam a viagem inteira (eventos, restaurantes,
check-in) num só lugar. Uma **plataforma admin** enxerga e audita tudo, com isolamento
multi-tenant garantido no backend.

O projeto é full-stack (API + frontend + banco + filas assíncronas), com o mesmo rigor de
produto real: concorrência tratada de verdade (não só "no feliz caminho"), idempotência,
transações, RBAC por papel e por posse de recurso, testes de integração contra Postgres/Redis
reais (não mockados) e uma suíte E2E que reserva uma cabine de ponta a ponta num browser real.

## Problema

Comercializar um cruzeiro temático hoje é um Frankenstein de planilha + WhatsApp + um checkout
genérico que não entende "cabine", "hóspede" ou "embarque". Isso gera três problemas recorrentes:

1. **Overbooking** — duas pessoas reservando a mesma cabine ao mesmo tempo, resolvido manualmente
   depois (reembolso, cliente insatisfeito).
2. **Nenhuma visão do organizador** sobre ocupação, receita e quem de fato vai embarcar.
3. **Experiência fragmentada do passageiro** — o ingresso é um PDF solto, a programação de bordo
   vive num grupo de WhatsApp, e não há como saber "onde eu preciso estar agora" durante a viagem.

## Solução

Uma plataforma dedicada onde a **cabine é a unidade de estoque** (com um motor de
hold/expiração/lock que garante consistência sob concorrência real — ver
[Estratégia contra overbooking](#estratégia-contra-overbooking)), o **checkout já sai com preço,
cupom e taxa calculados no servidor** (nunca confiando em valor vindo do cliente), o **ingresso é
digital desde a emissão** (QR Code gerado sob demanda, check-in de uso único garantido sob
concorrência), e o **organizador tem um dashboard de verdade** (receita, ocupação, cancelamentos,
top eventos/experiências) com isolamento de dados garantido na própria query, nunca por filtro
posterior.

## Principais funcionalidades

| Persona | O que faz |
|---|---|
| **Visitante** | Explora o catálogo público (busca, filtros, ordenação, paginação), vê o detalhe de um cruzeiro e o mapa interativo do navio (decks, cabines, venues, restaurantes). |
| **Passageiro** | Reserva uma cabine (hold → hóspedes/adicionais → pagamento), recebe ingresso digital com QR Code, reserva eventos/restaurantes a bordo, acompanha tudo em "Minha Viagem" (timeline dia a dia). |
| **Staff do organizador** | Faz check-in de passageiros por código do ingresso (uso único, sob concorrência real). |
| **Admin do organizador** | Gerencia catálogo (navio, cruzeiros, eventos, restaurantes, experiências), vê dashboard (receita/ocupação/cancelamentos), gerencia reservas e passageiros. |
| **Admin da plataforma** | Painel global (13 áreas: usuários, organizadores, cruzeiros, navios, cabines, reservas, pagamentos, eventos, restaurantes, experiências, cupons, tickets, check-ins) + auditoria — enxerga e pode agir sobre qualquer organizador. |

## Arquitetura

Monorepo (`pnpm` workspaces + Turborepo) com dois apps e dois pacotes compartilhados:

```
apps/api      → NestJS 10 (API REST + jobs assíncronos)
apps/web      → Next.js 15 / App Router (site público + 3 painéis autenticados)
packages/contracts → schemas Zod compartilhados (o mesmo schema valida no back E gera o tipo no front)
packages/ui   → design system compartilhado (deliberadamente vazio na v1 — ver "Decisões arquiteturais")
infra/        → Docker Compose (dev) + Dockerfiles de produção (multi-stage, non-root, HEALTHCHECK)
docs/         → backlog, ADRs, matriz de permissões, devlog
```

**Backend** em camadas por módulo de domínio (não por tipo técnico):

```
modules/<dominio>/
  <dominio>.module.ts
  presentation/   # controllers — so validam DTO e delegam, nunca tem regra de negocio
  application/     # services — orquestram o caso de uso
  domain/          # policies puras (sem I/O) — testadas isoladamente, sem mock de Prisma
  persistence/      # repositories — unica camada que fala com o Prisma
```

Regra de dependência: um módulo só acessa outro através do `service` que ele exporta — nunca
importando o repository/Prisma de outro módulo. O grafo de módulos é um DAG (verificado
manualmente, sem ciclos): `BookingsModule`/`AdminModule` importam `TicketsModule`/
`ActivitiesModule` (para cascatear cancelamento), e nenhum dos dois importa de volta.

**Frontend** organizado por feature de negócio ("screaming architecture"): `features/booking`,
`features/ship-map`, `features/trip`, `features/organizer`, `features/admin` etc. — cada uma reúne
componentes, hooks e chamadas de serviço específicos daquele domínio. `components/` guarda só o
que é genérico o bastante pra ser usado por mais de uma feature.

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | NestJS 10, TypeScript, Prisma 5 (Postgres), Redis + BullMQ (filas), Zod (validação), JWT (auth), `nestjs-pino` (logs estruturados), `helmet`, Jest |
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4, Vitest, Playwright |
| Contratos | Zod, compartilhado via `packages/contracts` (mesmo schema valida request no back e tipa a resposta no front) |
| Infra dev | Docker Compose (Postgres 16, Redis 7, MailHog) |
| CI | GitHub Actions — 4 jobs encadeados (lint/typecheck/unit → integração → E2E → build de imagem + smoke test) |

## Decisões arquiteturais

Cada decisão não-trivial tem um ADR dedicado em [`docs/architecture/decisions/`](docs/architecture/decisions/)
(formato padrão: contexto, decisão, consequências). As mais relevantes:

- [ADR-0005](docs/architecture/decisions/0005-auth-and-rbac-design.md) — Auth e RBAC: por que um
  recurso de outro organizador é **404, não 403** (nunca confirmar existência a quem não é dono).
- [ADR-0006](docs/architecture/decisions/0006-catalog-layering.md) — Por que cruzeiro, navio,
  eventos, restaurantes etc. vivem consolidados num único módulo `catalog` (mesmo agregado de
  domínio), não um módulo Nest por sub-recurso.
- [ADR-0009](docs/architecture/decisions/0009-cabin-hold-engine.md) — O motor de hold de cabine
  (ver [Estratégia contra overbooking](#estratégia-contra-overbooking)).
- [ADR-0010](docs/architecture/decisions/0010-booking-domain.md) — Máquina de estados da reserva e
  idempotência via `Idempotency-Key`.
- [ADR-0011](docs/architecture/decisions/0011-pricing-engine.md) — Motor de preços puro (sem I/O),
  sempre recalculado no servidor no checkout, nunca confiando em valor do cliente.
- [ADR-0012](docs/architecture/decisions/0012-checkout-payment-gateway.md) — Checkout e o
  `PaymentGateway` simulado (interface trocável, aprovação/recusa/timeout tratados).
- [ADR-0013](docs/architecture/decisions/0013-digital-ticket-checkin.md) — Ingresso digital e
  check-in de uso único sob concorrência real.
- [ADR-0018](docs/architecture/decisions/0018-admin-panel.md) — Painel admin global e isolamento
  multi-tenant.
- [ADR-0019](docs/architecture/decisions/0019-events-and-notifications.md) — Eventos de domínio +
  fila de notificações (o que é síncrono, o que é assíncrono, e por quê).
- [ADR-0020](docs/architecture/decisions/0020-hardening.md) — Hardening de segurança/backend/
  frontend/DevOps feito antes desta entrega.

## Modelagem

32 modelos Prisma, 17 enums, 46 índices/constraints. Núcleo do domínio:

```
Organizer ──< Ship ──< Deck ──< Cabin >── CabinCategory
                │                              │
                └──< Cruise >──────────────────┘ (CruiseCabinPricing: preço por categoria, por sailing)
                       │
                       ├──< ItineraryStop (portos, dia a dia)
                       ├──< Event / Restaurant+DiningSlot / Experience (programação a bordo)
                       └──< Booking >── Cabin
                              ├──< BookingGuest (hóspedes)
                              ├──< BookingExperience / EventReservation / DiningReservation
                              ├──< Payment
                              └──< Ticket >── CheckIn
```

Ponto de modelagem deliberado: **preço é uma foto no tempo**, não uma referência viva —
`Booking.totalAmount`, `BookingExperience.priceAtBooking` etc. são colunas próprias, congeladas no
momento da reserva. Mudar o preço de uma categoria de cabine depois nunca altera o valor de uma
reserva já feita. Cancelamento é sempre **soft** (`status` + `cancelledAt`), nunca `DELETE` — o
histórico de auditoria e o relatório do organizador dependem disso.

## Fluxo de reserva

```
1. GET  /cruises/:slug/deck-map              → mapa do navio com disponibilidade em tempo real
2. POST /cruises/:slug/cabins/:id/hold       → cria o hold (janela de 15min, ver ADR-0009)
3. PUT  /bookings/:id/details                → hóspedes + adicionais; preço recalculado no servidor
4. POST /bookings/:id/checkout               → valida hold, cria Payment, chama o PaymentGateway
5. (síncrono) PIX aprova/recusa na hora → reserva CONFIRMED ou CANCELLED
   (assíncrono) BOLETO fica PAYMENT_PENDING → POST /bookings/:id/confirm-payment fecha depois
6. Ticket emitido por hóspede (job assíncrono, ver "Eventos assíncronos") assim que CONFIRMED
```

Cada etapa é validada de novo no passo seguinte — o servidor nunca confia em nada calculado antes
(preço, disponibilidade, dono da reserva). `Idempotency-Key` opcional no hold e no checkout: um
retry de rede com a mesma chave sempre devolve o mesmo resultado, nunca duplica.

No frontend, o mesmo fluxo é conduzido pelo mapa do navio (`ShipMap` → "Selecionar cabine" →
`BookingModal`, uma máquina de estados hold → hóspedes → pagamento → confirmação), coberto de
ponta a ponta por `apps/web/tests/e2e/booking-flow.spec.ts` num browser real.

## Estratégia contra overbooking

O mesmo princípio se repete em **todo** recurso com capacidade limitada (cabine, evento, horário
de restaurante):

1. `SELECT ... FOR UPDATE` trava a linha do recurso disputado **antes** de somar quem já reservou.
2. Só depois da soma (dentro da mesma transação, com o lock ainda seguro) a nova reserva é
   decidida — nunca "verificar e depois escrever" como dois passos separados.
3. Um índice único parcial (cabine) ou a soma de `partySize` das reservas ativas (evento/
   restaurante) é a segunda linha de defesa, no nível do banco — mesmo que a lógica de aplicação
   tivesse um bug, o Postgres recusaria a segunda linha.

Provado sob concorrência **real**, não simulada: os testes de integração disparam N requisições
verdadeiramente simultâneas (`Promise.all`, sem `await` entre elas) contra o mesmo recurso e
confirmam que só uma vence (`cabin-hold-concurrency.e2e-spec.ts`, `activities.e2e-spec.ts` —
"overbooking prevention under real concurrency", `check-in.e2e-spec.ts`).

Cabine tem uma nuance a mais: o hold expira sozinho (job BullMQ agendado, mas isso é só
UX — a fonte de verdade é sempre `holdExpiresAt` comparado a `now` no momento da próxima tentativa
de hold da mesma cabine, nunca o job em si). Ver [ADR-0009](docs/architecture/decisions/0009-cabin-hold-engine.md).

## Autenticação e autorização

JWT com **rotação de refresh token**: access token de 15min (só em memória no frontend, nunca
`localStorage`), refresh token de 7 dias num cookie `httpOnly`+`SameSite=Lax`. Cada uso do refresh
token o invalida e emite um par novo; um refresh token já usado sendo reapresentado é tratado como
possível roubo e revoga **todos** os tokens do usuário. RBAC por 4 papéis
(`PASSENGER`/`ORGANIZER_STAFF`/`ORGANIZER_ADMIN`/`PLATFORM_ADMIN`) via `@Roles()` decorator +
`RolesGuard` global — nenhuma rota depende de um default implícito não-documentado (toda rota é
`@Public()` ou tem um `@Roles()` explícito, verificado manualmente rota por rota).

**Regra consistente pra posse de recurso** (não só papel): quando um recurso pertence a outro
organizador, a resposta é sempre **404, nunca 403** — 403 confirmaria a existência do recurso a
quem não deveria nem saber que ele existe (ver ADR-0005). Verificado com 30+ testes de integração
dedicados a isolamento multi-tenant (`rbac.e2e-spec.ts`, `organizer-portal.e2e-spec.ts`) — um
organizador nunca lê ou altera dado de outro, provado, não assumido.

Matriz completa de permissões por rota em [`docs/architecture/api-permissions.md`](docs/architecture/api-permissions.md).

## Pagamentos

`PaymentGateway` é uma interface (`charge`/`retrieve`), com uma única implementação
(`FakePaymentGateway`) — gateway real (Stripe/Mercado Pago) fica fora de escopo desta entrega, mas
a interface já é o ponto de troca (é a peça trocada nos testes via injeção de dependência, prova
de que não é abstração decorativa). PIX aprova/recusa **na hora** (síncrono); BOLETO fica
`PAYMENT_PENDING` até um callback assíncrono confirmar. Timeout do gateway nunca é assumido como
falha — o checkout **sempre consulta** o resultado real (`retrieve`) antes de decidir, nunca
confia cegamente em ter recebido um callback. Preço final é **sempre recalculado no servidor** a
partir das tabelas de origem no momento do checkout, nunca do valor gravado num `updateDetails`
anterior (pode estar desatualizado). Ver [ADR-0012](docs/architecture/decisions/0012-checkout-payment-gateway.md).

## Eventos assíncronos

Duas camadas, com propósitos deliberadamente diferentes (ver [ADR-0019](docs/architecture/decisions/0019-events-and-notifications.md)):

- **Eventos de domínio** (`EventEmitter2`, síncrono, in-process) — `BOOKING_CREATED`,
  `BOOKING_CONFIRMED`, `BOOKING_CANCELLED`, `PAYMENT_APPROVED`, `PAYMENT_FAILED`,
  `TICKET_GENERATED`, `CHECKIN_COMPLETED`, `EVENT_BOOKED`, `EVENT_UPDATED`. Emitidos **depois** que
  a transação que os causou já commitou, nunca de dentro dela.
- **Fila de notificações** (BullMQ) — traduz os eventos que viram e-mail (confirmação, pagamento
  aprovado/recusado, ticket disponível, lembrete de embarque, alteração de evento, cancelamento)
  em jobs com retry (5 tentativas, backoff exponencial) + idempotência (jobId determinístico + 
  checagem de status antes de reenviar) + dead-letter queue quando as tentativas se esgotam.

**O que é síncrono e por quê**: tudo que o usuário precisa saber na resposta HTTP (aprovação de
pagamento PIX, disponibilidade de cabine, preço calculado) — esperar isso assincronamente seria
pior UX sem ganho nenhum. **O que é assíncrono e por quê**: só I/O de rede pra um serviço externo
que pode ser lento ou falhar (envio de e-mail via SMTP) — bloquear a resposta HTTP nisso seria
acoplamento desnecessário. Em dev, MailHog (`localhost:8025`) mostra os e-mails de verdade sendo
enviados.

## Testes

| Camada | Onde | O que prova |
|---|---|---|
| Unitário (274, API) | `apps/api/test/unit/` | Toda `*.policy.ts` (regra pura, sem mock de I/O) + services com mock só na borda de I/O real (Prisma/gateway/fila) |
| Integração (141, API) | `apps/api/test/integration/` | Contra Postgres/Redis **reais** — concorrência genuína, transações, RBAC, isolamento multi-tenant, idempotência |
| Unitário (30, web) | `apps/web/tests/unit/` | Lógica pura do frontend (timeline, formatação, layout do mapa do navio) |
| E2E (10, Playwright) | `apps/web/tests/e2e/` | Browser real: home, catálogo, detalhe, mapa do navio, **reserva de ponta a ponta** (login → hold → hóspedes → pagamento PIX → confirmação → "Minha viagem") |

Mocks só na fronteira real de I/O (repository/Prisma, gateway de pagamento, fila BullMQ) — nenhuma
regra de negócio pura é mockada; `PricingEngine`, `CouponPolicy`, `CheckInPolicy` etc. são
exercitados diretamente. Testes de concorrência disparam N requisições verdadeiramente
simultâneas, não sequenciais disfarçadas.

## Segurança

Verificado e corrigido nas duas rodadas de hardening (ver [ADR-0020](docs/architecture/decisions/0020-hardening.md)
e `docs/DEVLOG.md`, entradas de 2026-09-04 e 2026-09-05):

- **SQL injection**: toda query usa Prisma parametrizado ou `Prisma.sql`/tagged template — nunca
  concatenação de string.
- **XSS**: nenhum `dangerouslySetInnerHTML` — todo texto passa pelo escape automático do React.
- **CSRF**: não é risco vivo — o único fluxo por cookie (`/auth/refresh`, `/auth/logout`) usa
  `SameSite=Lax` (bloqueia POST cross-site forjado); toda outra rota autenticada usa Bearer token
  no header, que uma página CSRF não consegue forjar.
- **Segredos**: JWT exige 32+ caracteres e os dois segredos (access/refresh) diferentes entre si;
  nada de credencial real commitada (`.env.example` só tem placeholders).
- **Rate limiting**: `@nestjs/throttler` — piso global (100/min) + limites mais apertados em rotas
  sensíveis (login 10/min, registro/forgot-password 5/min).
- **Headers**: `helmet` (CSP, `X-Content-Type-Options`, `X-Frame-Options` etc.).
- **Logs**: `pino` com `redact` cobrindo `Authorization`/`Cookie`/`Set-Cookie` — nenhum JWT, cookie
  de sessão ou token de reset de senha é gravado em texto puro (nem em produção).
  `AllExceptionsFilter` correlaciona todo 500 com o `req.id` da requisição que o causou.
  `console.error`/stack trace nunca vazam pro cliente — mensagem genérica fora de dev.
- **Autorização**: ver [Autenticação e autorização](#autenticação-e-autorização) acima — 404
  consistente pra recurso de outro organizador, verificado em todo o codebase, não só nos pontos
  óbvios (achado e corrigido no hardening: dois módulos usavam 403 por engano).
- **Senhas**: hash com bcrypt, nunca reversível; token de recuperação de senha é hash de 32 bytes
  aleatórios, nunca logado fora de desenvolvimento.

## Observabilidade

Logging estruturado (`nestjs-pino`) com correlação de request (`req.id` em todo log da mesma
requisição, do início ao fim) cobre a observabilidade desta fase. `GET /health` agrega Postgres +
Redis (`@nestjs/terminus`) — usado por Docker/orquestrador pra saber se o processo está pronto de
verdade, não só "de pé". **Métricas e tracing (Prometheus/OpenTelemetry/APM) ficam fora de escopo**
— ver [Limitações conhecidas](#limitações-conhecidas).

## Como executar localmente

Pré-requisitos: Node.js 20+ (ver `.nvmrc`), [pnpm](https://pnpm.io) 9+ (`corepack enable`), Docker
+ Docker Compose.

```bash
git clone <repo> seapass && cd seapass

# 1. Variaveis de ambiente
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# 2. Infraestrutura (Postgres, Redis, MailHog)
docker compose -f infra/docker-compose.yml up -d

# 3. Dependencias (o postinstall ja gera o Prisma Client)
pnpm install

# 4. Aplica as migrations e popula dados de demonstracao
pnpm db:migrate
pnpm db:seed

# 5. Sobe web + api juntos (via Turborepo)
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:3333
- Health check: http://localhost:3333/health
- Swagger: http://localhost:3333/docs (ver [Como acessar Swagger](#como-acessar-swagger))
- MailHog (e-mails de notificação): http://localhost:8025

A API sobe mesmo que Postgres/Redis ainda não estejam prontos — o processo não cai, `/health`
reporta a dependência como indisponível (`503`) até o `docker compose up` terminar.

## Variáveis de ambiente

Cada `.env.example` (raiz, `apps/api/`, `apps/web/`) documenta inline o que cada variável faz.
Validado em runtime por Zod (`apps/api/src/config/env.schema.ts`) — a API **recusa subir** se algo
obrigatório faltar ou for inválido (ex.: segredo JWT curto, os dois segredos JWT iguais entre si,
`DATABASE_URL` sem `sslmode` em produção), em vez de falhar silenciosamente depois. Só o essencial:
Postgres, Redis, JWT, SMTP (notificações) e a URL do frontend (CORS). Não há variável para algo
que o código não usa de verdade (ver [Limitações conhecidas](#limitações-conhecidas) sobre o que
foi removido nesta revisão por estar sem nenhum consumidor real).

### Usuários de demonstração

`pnpm db:seed` popula um cenário completo: 2 organizadores, 1 navio (4 decks, 22 cabines), 6
cruzeiros temáticos publicados (itinerário de 5 dias, preço por categoria, eventos, restaurantes,
experiências), um cupom (`ROCKINSEA10`) e reservas de demonstração. Idempotente — pode rodar de
novo sem duplicar.

| E-mail | Papel | Senha |
|---|---|---|
| `admin@seapass.com` | Admin da plataforma | `Seapass@123` |
| `organizador@rockinsea.com` | Admin do organizador "Rock in Sea" | `Seapass@123` |
| `operador@rockinsea.com` | Staff do organizador (check-in) | `Seapass@123` |
| `passageiro1@example.com` / `passageiro2@example.com` | Passageiros | `Seapass@123` |

## Como executar testes

```bash
pnpm test              # unitario — API (Jest) + web (Vitest), via Turborepo
pnpm test:integration  # integracao — precisa de Postgres/Redis reais no ar
pnpm test:e2e          # E2E (Playwright) — precisa de web + api no ar (pnpm dev)
pnpm lint               # ESLint em todos os workspaces
pnpm typecheck          # tsc --noEmit em todos os workspaces
```

CI (GitHub Actions, `.github/workflows/ci.yml`) roda os 4 em sequência a cada PR: lint/typecheck/
unit → integração (Postgres/Redis via Docker) → E2E (stack completa + build real) → build das
imagens Docker + smoke test (o container sobe e responde HTTP, não só "buildou").

## Como acessar Swagger

Com a API no ar, `http://localhost:3333/docs` — gerado automaticamente
(`@nestjs/swagger`) a partir dos DTOs Zod e decorators de cada controller; **só monta fora de
produção** (`NODE_ENV !== 'production'`), pra não expor o mapa completo de rotas/schemas numa
API pública de verdade.

## Estrutura do projeto

```
apps/api/src/modules/     # auth, users, organizers, catalog, bookings, activities,
                           # pricing, payments, tickets, notifications, admin
apps/api/src/domain-events/  # eventos de dominio (EventEmitter2)
apps/api/src/notifications/  # fila BullMQ + templates de e-mail
apps/api/src/database/prisma/  # schema.prisma, migrations/, seed.ts
apps/web/src/app/          # rotas (App Router) — publico, (auth), (passenger), (organizer), (admin)
apps/web/src/features/     # booking, ship-map, trip, organizer, admin, cruise-detail, cruise-discovery
apps/web/src/services/     # uma funcao por chamada a API — nunca regra de negocio aqui
packages/contracts/src/    # schemas Zod compartilhados, 1 arquivo por dominio
docs/architecture/decisions/  # 20 ADRs
```

## Limitações conhecidas

Escopo deliberadamente fora desta entrega (não esquecido — decidido):

- **Gateway de pagamento real** (Stripe/Mercado Pago) — `PaymentGateway` já é a interface pronta
  pra isso; só a implementação de produção falta.
- **Upload de imagem/arquivo** — cobertura de cruzeiro/navio é hoje uma URL (`coverImageUrl`),
  não upload. Uma auditoria desta revisão encontrou infraestrutura S3-compatible (MinIO) e
  variáveis de storage provisionadas desde o início do projeto **sem nenhum consumidor real** —
  removidas nesta revisão (nenhum código as usava). Reintroduzir upload de verdade é um passo
  concreto, não um retrabalho: a variável `STORAGE_*` e o serviço MinIO no Compose só voltam
  quando o primeiro endpoint de upload existir.
- **Leitura de QR Code por câmera** — o check-in hoje é por código digitado/colado; a tela já é
  estruturada pra receber um scanner sem mudar o backend.
- **Métricas e tracing (Prometheus/OpenTelemetry/APM)** — logging estruturado com correlação de
  request cobre a observabilidade desta fase; painel de métricas fica pra uma próxima rodada.
- **Duplicação controlada entre as ~14 páginas do painel admin e ~9 do organizador** — cada uma
  usa `useAdminList`/`useAdminDetail` (genuinamente reutilizados, não especulativos) pra buscar
  dados, mas a casca JSX (tabela + modal) é repetida por página. Uma auditoria desta revisão
  considerou extrair um componente genérico `AdminResourceTable` e decidiu **não fazer agora** —
  colunas/ações diferem o bastante por recurso que a abstração genérica precisaria de bastante
  indireção (render props) pra caber em todas, e essa troca (menos linhas, mais indireção) não
  paga por si só ainda. Fica como candidato real de refatoração, não como pendência ignorada.
- **`OrganizersService` mistura CRUD de tenant com um motor de analytics** (dashboard) num único
  arquivo de ~400 linhas. Considerado nesta revisão e decidido não separar agora — os dois
  compartilham `requireOwnedCruise`/`dateRangeFilter`, e separar exigiria ou duplicar essa checagem
  ou injetar um service dentro do outro só pra isso. Real, mas não urgente: nenhuma prova de que
  as duas partes crescerão em direções diferentes o bastante pra justificar a divisão hoje.

## Próximos passos

Roteiro completo e priorizado em [`docs/product/BACKLOG.md`](docs/product/BACKLOG.md). Destaques:

1. Gateway de pagamento real (o maior item de "ainda não é produção").
2. Extrair `OrganizerDashboardService` do `OrganizersService` quando o dashboard ganhar mais
   métricas (o ponto em que a mistura de responsabilidades para de compensar).
3. Componente genérico de tabela/modal pro painel admin, quando uma 15ª página repetir o mesmo
   padrão pela terceira vez de forma idêntica (sinal real de reuso, não especulação).
4. Upload de imagem de cruzeiro/navio (reintroduzindo storage S3-compatible só então).
5. Painel de métricas (Prometheus + Grafana, ou equivalente gerenciado).

---

## Decisões técnicas que eu explicaria em uma entrevista

Estas são as escolhas que eu destacaria numa entrevista técnica — cada uma tem um trade-off real
por trás, não é só "a forma de fazer".

**1. 404, não 403, para recurso de outro organizador.**
A tentação óbvia é usar 403 ("proibido"). Mas 403 confirma que o recurso *existe* — só que não é
seu. Isso vaza informação: um organizador poderia enumerar IDs de reserva/cabine/ticket de um
concorrente e aprender quantos existem, mesmo sem conseguir ler o conteúdo. 404 ("não encontrado")
é indistinguível de "esse ID nunca existiu". Defenderia isso citando que uma auditoria posterior
encontrou exatamente essa inconsistência em dois módulos (check-in e reservas de atividade) —
onde eu mesmo corrigi depois de perceber que a regra não estava sendo aplicada uniformemente,
o que mostra que é fácil de esquecer e vale a pena um teste de regressão específico pra isso.

**2. Preço nunca confia no cliente — sempre recalculado no servidor no checkout.**
`updateDetails` calcula e grava um preço, mas o `checkout` recalcula do zero a partir das tabelas
de origem (categoria de cabine, cupom, adicionais) — nunca lê o valor já gravado. Isso parece
redundante até você perceber o cenário real: o preço de uma categoria muda entre o
`updateDetails` e o `checkout` (o organizador editou o preço nesse meio-tempo), ou o cupom expirou
nesse intervalo. Confiar no valor gravado cobraria um preço que não é mais válido.

**3. `SELECT ... FOR UPDATE` em vez de otimista (`version`/`updatedAt` check).**
Escolhido porque o domínio (hold de cabine, capacidade de evento) tem contenção real e frequente
(vários usuários mirando o mesmo recurso escasso ao mesmo tempo), onde lock pessimista evita o
custo de retry em otimista sob alta contenção. Defenderia que testei isso de verdade — não é uma
escolha de livro-texto, é testada com requisições verdadeiramente concorrentes
(`Promise.all` sem `await` entre elas) provando que só uma vence.

**4. Idempotência via `Idempotency-Key` opcional, não obrigatória.**
Obrigar todo cliente a mandar uma chave adicionaria fricção pra um MVP sem ganho real hoje (não
há múltiplos clientes/dispositivos reenviando a mesma ação ainda). Opcional dá o benefício pra
quem precisa (retry de rede) sem impor overhead a quem não precisa.

**5. Notificação é assíncrona (fila); a decisão de negócio que a dispara não é.**
Só o envio de e-mail (I/O de rede pra SMTP externo) vai pra fila — a aprovação de pagamento PIX,
por exemplo, continua síncrona porque o usuário *precisa* saber na resposta HTTP se foi aprovado.
Defenderia que "async tudo" seria over-engineering: o custo de coordenar estado entre uma resposta
HTTP e um resultado que chega depois só vale a pena quando o trabalho em si é genuinamente lento
ou não-confiável (e-mail é; verificar se um pagamento PIX foi aprovado, no gateway simulado, não).

**6. Dois camadas de evento (domain events síncronos + fila assíncrona), não uma só.**
Eventos de domínio (`EventEmitter2`) desacoplam quem *causa* algo (BookingsService) de quem
*reage* (o listener de notificações) sem forçar tudo a virar fila. A fila entra só onde há I/O de
rede de verdade. Defenderia isso como o padrão certo pra não confundir "desacoplamento" com
"assíncrono" — são propriedades diferentes.

**7. `catalog` como um módulo só, não um módulo Nest por sub-recurso.**
Cruzeiro, navio, deck, cabine, evento, restaurante, artista, porto — tudo debaixo de `catalog/`,
porque pertencem ao mesmo agregado de domínio (o "catálogo de um cruzeiro") e mudam juntos.
Defenderia que um módulo por tabela teria sido granularidade artificial: a fronteira de módulo
deveria refletir fronteira de *conceito de domínio*, não normalização de banco.

**8. `packages/ui` existe e está deliberadamente vazio.**
Fácil de interpretar como "esqueceram de implementar". Defenderia o oposto: promover um
componente pra um design system compartilhado *antes* dele repetir de verdade é abstração
prematura — a interface certa só fica óbvia depois que existem 2+ usos reais pra comparar. O
pacote existe pra não precisar criar a estrutura depois; fica vazio até o primeiro componente
realmente se repetir entre duas features.

**9. Cancelamento é sempre soft-delete (`status` + `cancelledAt`), nunca `DELETE`.**
Auditoria, relatório do organizador ("quantas reservas foram canceladas este mês") e o próprio
ingresso (que precisa existir pra provar que já foi emitido e depois invalidado) dependem do
histórico. Defenderia isso citando que até `Cabin`/`CabinCategory` seguem o mesmo princípio
(`status` de operação, nunca excluídas) — consistência de padrão em todo o schema, não uma regra
isolada.

**10. Cascata de cancelamento em bulk (`updateMany`), nunca um loop por linha.**
Cancelar um cruzeiro inteiro pode afetar dezenas de reservas — um loop faria uma query por linha
(N+1). `updateMany` filtrado por uma lista de IDs já coletada faz o mesmo trabalho numa única
instrução. Defenderia que essa não é uma otimização prematura: é o padrão desde a primeira versão
do cancelamento em cascata, porque o cenário (cancelar um cruzeiro com reservas de verdade) é
esperado, não hipotético.

**11. Refresh token com rotação + detecção de reuso, mas com um guard de "renovação em voo".**
Rotação (cada uso invalida o token e emite um novo) é o padrão certo contra roubo de token — mas
tem uma pegadinha: duas chamadas de renovação genuinamente concorrentes da MESMA sessão (um timer
e um listener de foco de aba disparando quase juntos) acionam a detecção de reuso contra si
mesmas, deslogando um usuário legítimo. A correção não foi abandonar a rotação (que é a parte
certa) — foi adicionar um guard que deduplica chamadas concorrentes num único request em voo.
Defenderia isso como exemplo de "a primeira decisão estava certa, o bug era na borda da
implementação, não na escolha arquitetural".

**12. Access token só em memória no frontend, nunca `localStorage`.**
`localStorage` é acessível a qualquer script (XSS). O refresh token (o que teria dano maior se
vazado, por durar 7 dias) fica num cookie `httpOnly` — inacessível a JavaScript por design. O
access token (15min, dano limitado por natureza) fica em memória (React state) — se vazar por XSS,
a janela de exploração é curta e o refresh token nunca é exposto no processo.

**13. Zod como única fonte de validação, compartilhado via `packages/contracts`.**
Um schema por DTO, usado tanto pelo `ZodValidationPipe` do NestJS quanto como tipo TypeScript no
frontend (`z.infer`) — o mesmo arquivo valida em runtime no backend E tipa em compile-time no
frontend, nunca dessincronizados. Defenderia isso contra a alternativa (`class-validator` +
DTOs manuais espelhados no frontend) como eliminar uma classe inteira de bug (schema do backend e
tipo do frontend saindo de sincronia).

**14. `AllExceptionsFilter` global, com correlação de request no log, sem vazar stack trace ao cliente.**
Toda exceção não tratada cai num filtro central que loga o stack completo + o `req.id` (pra
correlacionar com o log de request/response da mesma chamada) mas devolve uma mensagem genérica ao
cliente fora de desenvolvimento. Defenderia isso como o equilíbrio certo entre observabilidade
(quem opera o sistema vê tudo) e segurança (quem ataca o sistema não aprende nada com o erro).

**15. Rate limiting com `skipIf` condicionado a `NODE_ENV === 'test'`.**
Sem isso, uma suíte de integração que registra vários usuários numa mesma execução estouraria o
limite de `/auth/register` por exercitar a aplicação normalmente, não por abuso de verdade.
Defenderia a escolha de desligar por ambiente (não por header/flag que um cliente real poderia
mandar) — não há como um atacante se passar por "ambiente de teste" de fora.

**16. Testes de integração contra Postgres/Redis reais, nunca mockados.**
Mais lento que mock, de propósito. A classe de bug que este projeto mais precisa provar que não
tem (race condition, deadlock, comportamento de transação) é exatamente a que um mock de Prisma
não consegue reproduzir — um mock nunca vai ter uma condição de corrida de verdade. Defenderia
que "testes rápidos com mock" e "testes que provam ausência de race condition" são objetivos
diferentes, e este projeto precisava do segundo.

**17. `BookingsService` com ~800 linhas — decisão consciente de não dividir.**
Parece grande à primeira vista, mas é o ciclo de vida inteiro de UM agregado (hold → detalhes →
checkout → resultado do pagamento → confirmar/cancelar/expirar), com métodos privados
compartilhados entre os públicos (recálculo de preço, chamada ao gateway, aplicação do resultado).
Defenderia que dividir aqui trocaria coesão por indireção sem ganho real — o teste de "está bem
dividido" não é contagem de linhas, é se cada parte tem uma razão PRÓPRIA de mudar; aqui, tudo
muda pela mesma razão (uma regra do ciclo de vida da reserva).

**18. MinIO/S3 provisionado desde o início do projeto, removido nesta revisão.**
Fácil de deixar "porque já estava lá". Defenderia a remoção como o oposto de indecisão: uma
auditoria honesta encontrou infraestrutura sem nenhum consumidor real (zero linhas de código
usando as variáveis `STORAGE_*`) e a decisão foi desligá-la agora, documentando exatamente o que
falta pra religar (o primeiro endpoint de upload) — em vez de manter uma dependência de Docker e
uma seção de variáveis de ambiente que nada usa "por via das dúvidas".

**19. `useAdminList`/`useAdminDetail` compartilhados entre 14 páginas, mas sem um componente de tabela genérico.**
Extraí a parte que genuinamente repete de forma idêntica (busca paginada + estado de loading/erro)
num hook, mas deixei a apresentação (colunas, ações) específica de cada página. Defenderia que
"DRY" se aplica ao comportamento que é de fato idêntico, não à aparência — forçar uma tabela
genérica cedo demais teria significado ou uma API de props enorme (uma pra cada variação) ou
perder flexibilidade real que cada página precisa.

**20. Migrations escritas à mão, aplicadas via `migrate deploy`, não `migrate dev`.**
Ambiente específico desta máquina de desenvolvimento (o role do Postgres não tem `CREATEDB`, que
`migrate dev` precisa pro shadow database) — mas defenderia a solução como generalizável: escrever
o SQL da migration manualmente e aplicar via `deploy` é exatamente o fluxo que um pipeline de CI/CD
de produção usa de qualquer forma (nunca se roda `migrate dev` contra produção). Não foi um
workaround só pra "fazer funcionar aqui" — é o caminho que o projeto usaria em produção também.
