# SeaPass

Plataforma de comercialização e gestão de cruzeiros temáticos (teste técnico — dev pleno).

- Backlog do produto: [`docs/product/BACKLOG.md`](docs/product/BACKLOG.md)
- Stack tecnológica e estrutura do monorepo: [`docs/architecture/stack-and-structure.md`](docs/architecture/stack-and-structure.md)
- Autenticação, RBAC e matriz de permissões da API: [`docs/architecture/api-permissions.md`](docs/architecture/api-permissions.md)
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
- Health check da API: http://localhost:3333/health
- Docs da API (Swagger): http://localhost:3333/docs

A API sobe mesmo que Postgres/Redis ainda não estejam prontos — o processo não cai, apenas
`/health` reporta a dependência como indisponível (`503`) até o `docker compose up` terminar.

### Dados de demonstração (seed)

`pnpm db:seed` popula um cenário completo pronto para navegar: 2 organizadores (um aprovado, um
pendente), 1 navio com 4 decks/categorias/22 cabines, 1 cruzeiro publicado com itinerário de 5
dias, preços por categoria, eventos, restaurantes e experiências, um cupom de desconto
(`ROCKINSEA10`) e reservas de demonstração (uma `HELD` e uma `CONFIRMED` com hóspede, adicional,
cupom e pagamento simulado aprovado — preço calculado pela mesma função pura do domínio de
Booking, nunca digitado à mão). É idempotente: pode rodar de novo sem duplicar dados.

Usuários de teste (senha para todos: `Seapass@123`):

| E-mail | Papel |
|---|---|
| `admin@seapass.com` | Admin da plataforma |
| `organizador@rockinsea.com` | Admin do organizador "Rock in Sea" |
| `operador@rockinsea.com` | Operador do organizador "Rock in Sea" |
| `passageiro1@example.com` / `passageiro2@example.com` | Passageiros |

### Autenticação

```bash
# Cadastro de passageiro (retorna accessToken + seta cookie httpOnly de refresh)
curl -X POST http://localhost:3333/auth/register -H "Content-Type: application/json" \
  -d '{"email":"voce@example.com","password":"SenhaForte123","fullName":"Seu Nome"}'

# Login
curl -X POST http://localhost:3333/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@seapass.com","password":"Seapass@123"}'

# Rota protegida — use o accessToken retornado acima
curl http://localhost:3333/auth/me -H "Authorization: Bearer <accessToken>"
```

Ver [`docs/architecture/api-permissions.md`](docs/architecture/api-permissions.md) para a matriz
completa de quem pode acessar cada endpoint (Passenger, Organizer Admin, Organizer Staff,
Platform Admin), o design de refresh token e o fluxo de recuperação de senha em dev.

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
- **Prisma**: `schema.prisma` tem a modelagem completa do domínio (26 models — ver
  `docs/architecture/decisions/0004-prisma-reinstated-with-domain-model.md`). `pnpm install` já
  gera o Prisma Client automaticamente (`postinstall`); rode `pnpm db:migrate` para aplicar as
  migrations antes do primeiro `pnpm dev`.

## Módulo de catálogo

APIs de descoberta e gestão de conteúdo — navios, decks, cabines, categorias de cabine, portos,
artistas, venues, restaurantes — e o núcleo do catálogo, **cruzeiros**: criação, edição,
publicação/despublicação (com regras de negócio — precisa de itinerário e preço definidos),
listagem pública paginada com filtros (tema, destino, período, faixa de preço, organizador,
status) e ordenação (inclusive por preço mínimo). Escrita sempre restrita a `ORGANIZER_ADMIN`
(escopado ao próprio organizador — nunca vê/edita recurso de outro) ou `PLATFORM_ADMIN` para dado
de referência global (portos). Leitura de cruzeiros publicados é sempre pública. Ver a matriz
completa em [`docs/architecture/api-permissions.md`](docs/architecture/api-permissions.md) e o
racional de arquitetura (camadas controller/application/domain/persistence) em
[ADR-0006](docs/architecture/decisions/0006-catalog-layering.md).

```bash
# Catalogo publico, com filtros/paginacao/ordenacao
curl "http://localhost:3333/cruises?theme=Rock&sortBy=price&sortOrder=asc&page=1&pageSize=10"
curl "http://localhost:3333/cruises/rock-in-sea-classicos-do-rock"
```

## Frontend público

Home, exploração de cruzeiros (`/cruzeiros` — busca livre, filtros de tema/destino/data/preço,
ordenação, tudo refletido na URL) e página de detalhe (`/cruzeiros/[slug]` — hero, itinerário,
atrações do navio, eventos, experiências, restaurantes, categorias de cabine), integrados à API
real via Server Components. Estados de loading, erro, vazio e sucesso tratados explicitamente em
cada página. Racional de decisões (Server Components vs. TanStack Query, `ServiceResult<T>` para
erro, etc.) em [ADR-0007](docs/architecture/decisions/0007-public-frontend.md).

```bash
# Com a API rodando em :3333, abrir o site publico
pnpm --filter @seapass/web dev   # http://localhost:3000
```

## Mapa interativo do navio

Na página de detalhe do cruzeiro: seleção de deck, zoom/pan, cabines e instalações (teatro,
lounge, bar, piscina, área de lazer, restaurantes) clicáveis com tooltip, painel de detalhe,
legenda e 4 estados reais de disponibilidade de cabine (`AVAILABLE`/`HELD`/`BOOKED`/
`UNAVAILABLE`, calculados por `CabinAvailabilityPolicy` a partir das reservas do cruzeiro). Planta
gerada por uma função pura no frontend a partir dos dados reais do deck (sem coordenadas
inventadas no banco). Racional completo em
[ADR-0008](docs/architecture/decisions/0008-ship-deck-map.md).

```bash
# Decks + cabines (preco/disponibilidade deste cruzeiro) + venues + restaurantes
curl "http://localhost:3333/cruises/rock-in-sea-classicos-do-rock/deck-map"
```

## Motor de disponibilidade de cabine

Reserva temporária (hold) de cabine, com garantia real contra overbooking: `POST
/cruises/:slug/cabins/:cabinId/hold` (`AVAILABLE` → `HELD`, expira sozinho após
`CABIN_HOLD_MINUTES`, default 15), `/cancel` e `/release`, e `GET
/cruises/:slug/cabins/:cabinId/availability` para consulta. Concorrência resolvida com transação
Postgres + `SELECT ... FOR UPDATE` na cabine (serializa tentativas simultâneas de verdade) +
índice único parcial como rede de segurança; BullMQ agenda a expiração proativa de cada hold (UX,
não a garantia de corretude em si). Racional completo — incluindo por que a estratégia evita
overbooking e o que foi descartado — em
[ADR-0009](docs/architecture/decisions/0009-cabin-hold-engine.md).

```bash
TOKEN=$(curl -s -X POST localhost:3333/auth/login -H "Content-Type: application/json" \
  -d '{"email":"passageiro1@example.com","password":"Seapass@123"}' | jq -r .accessToken)
curl -s -X POST localhost:3333/cruises/rock-in-sea-classicos-do-rock/cabins/<cabinId>/hold \
  -H "Authorization: Bearer $TOKEN"
```

## Domínio de Booking (hóspedes, adicionais, preço, checkout simulado)

Fluxo completo cruzeiro → cabine → hóspedes → adicionais → reserva → checkout → confirmação de
pagamento, sobre o motor de hold acima: `PUT /bookings/:id/details` (define hóspedes e adicionais,
recalcula preço), `POST /bookings/:id/checkout` (`HELD` → `PAYMENT_PENDING`, cria um `Payment`
simulado), `POST /bookings/:id/confirm-payment` (`PAYMENT_PENDING` → `CONFIRMED`, papel do
callback de um gateway real que ainda não existe), além de `GET /bookings/me`, `GET /bookings/:id`
e `POST /bookings/:id/cancel`. Preço sempre em quatro colunas explícitas (`subtotalAmount`,
`discountAmount`, `feeAmount`, `totalAmount`), calculadas pelo motor de preços (ver seção abaixo).
Hold vencido vira o estado `EXPIRED` (distinto de `CANCELLED`, que é sempre ação do usuário).
Idempotência via header `Idempotency-Key` na criação do hold e por estado em
`checkout`/`confirm-payment` — nenhum gateway de pagamento real é chamado. Racional completo em
[ADR-0010](docs/architecture/decisions/0010-booking-domain.md).

```bash
BOOKING=$(curl -s -X POST localhost:3333/cruises/rock-in-sea-classicos-do-rock/cabins/<cabinId>/hold \
  -H "Authorization: Bearer $TOKEN" | jq -r .id)
curl -s -X PUT localhost:3333/bookings/$BOOKING/details -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"guests":[{"fullName":"Seu Nome","documentType":"PASSPORT","documentNumber":"AB123456","isPrimary":true}]}'
curl -s -X POST localhost:3333/bookings/$BOOKING/checkout -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"paymentMethod":"PIX"}'
curl -s -X POST localhost:3333/bookings/$BOOKING/confirm-payment -H "Authorization: Bearer $TOKEN"
```

## Motor de preços (PricingEngine + CouponPolicy)

Domínio dedicado (`apps/api/src/modules/pricing/domain/`) ao cálculo de preço — nenhuma regra de
preço/cupom vive em controller. `PricingEngine.calculate` é puro e determinístico: preço da cabine
+ adicionais/experiências selecionados = subtotal; taxa de serviço (5%) + taxa fixa de embarque por
passageiro (R$50 cada, é como "número de passageiros" entra na conta) somadas ao `feeAmount`;
desconto do cupom subtraído antes da taxa. Todo o cálculo em `Prisma.Decimal`, arredondado a cada
passo (nunca `number` do JS) — garante `subtotal - desconto + taxa == total` exatamente, sem fração
de centavo. Cupom (`Coupon`) com código, percentual ou valor fixo, validade, limite de uso global e
por usuário, valor mínimo de compra e cruzeiros aplicáveis (`CouponCruise`, many-to-many — lista
vazia = qualquer cruzeiro). Sete regras de elegibilidade em ordem fixa e testada (`CouponPolicy`):
cupom inexistente, desativado, expirado, incompatível, valor mínimo não atingido, limite global
atingido, já utilizado pelo usuário — e válido, quando nenhuma falha. Racional completo em
[ADR-0011](docs/architecture/decisions/0011-pricing-engine.md).

## Checkout (PaymentGateway + FakePaymentGateway)

Domínio de pagamento desacoplado de provedor (`apps/api/src/modules/payments/`): interface
`PaymentGateway` (porta) + `FakePaymentGateway` (adaptador simulado, sem chamar rede nenhuma) —
trocar por Stripe/Mercado Pago é escrever uma nova classe e mudar uma linha em
`payments.module.ts`, sem tocar em `bookings` (esboço completo no ADR). `POST
/bookings/:id/checkout` valida o hold, **recalcula preço e cupom no servidor** (nunca confia no que
já estava salvo), cria o pagamento e chama o gateway — métodos síncronos (PIX/cartão) já confirmam
a reserva dentro do próprio checkout; `BOLETO` fica `PENDING` (assíncrono de verdade) até `POST
/bookings/:id/confirm-payment` (o "webhook" simulado). Estados tratados: aprovado, recusado (libera
a reserva com o motivo), pendente, timeout (nunca assume sucesso nem falha às cegas) e retry/
duplicata (idempotência real via `Idempotency-Key`, testada com requisições verdadeiramente
concorrentes). Ingresso digital emitido depois, assíncrono via BullMQ. Racional completo em
[ADR-0012](docs/architecture/decisions/0012-checkout-payment-gateway.md).

```bash
# PIX aprova na hora; BOLETO fica PENDING (ver /confirm-payment); Idempotency-Key opcional.
curl -s -X POST localhost:3333/bookings/$BOOKING/checkout -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"paymentMethod":"PIX"}'
```

## Ingresso digital e check-in

Ao confirmar, um `Ticket` é emitido por hóspede (código seguro via `crypto.randomUUID()`, QR Code
gerado sob demanda pela API — nunca persistido). `GET /tickets/me` devolve o ingresso com o QR já
pronto (`qrCodeDataUrl`), exibido em `/ingressos` (frontend do passageiro). O módulo de check-in do
Staff é por código, em duas etapas: `POST /check-in/lookup` (consulta, mostra o ticket e o estado
antes de qualquer mutação) e `POST /check-in/confirm` (a mutação — trava a linha do ticket, nunca
permite uso duplo, mesmo sob N confirmações verdadeiramente concorrentes). Quatro estados:
`NOT_CHECKED_IN`, `CHECKED_IN`, `INVALID` (código inexistente, reserva não confirmada ou ticket
cancelado) e `ALREADY_USED`. Interface dedicada em `/organizador/check-in` (Staff/Admin do
organizador). Racional completo em
[ADR-0013](docs/architecture/decisions/0013-digital-ticket-checkin.md).

```bash
curl -s -X POST localhost:3333/check-in/lookup -H "Authorization: Bearer $STAFF_TOKEN" \
  -H "Content-Type: application/json" -d '{"code":"TICKET-..."}'
curl -s -X POST localhost:3333/check-in/confirm -H "Authorization: Bearer $STAFF_TOKEN" \
  -H "Content-Type: application/json" -d '{"code":"TICKET-...","location":"Portão A"}'
```

### Login no frontend

`/login` autentica qualquer papel (passageiro, staff, admin) e redireciona para a área certa. O
access token vive só em memória (nunca `localStorage`) — a sessão é restaurada entre recarregamentos
via renovação silenciosa contra o cookie httpOnly de refresh (ver ADR-0005/0013), não por storage
persistente no browser.

## Experiência interna do cruzeiro (eventos, restaurantes, experiências)

Com a reserva já `CONFIRMED`, o passageiro reserva eventos e horários de restaurante para a própria
viagem em `/reservas` ("Minha viagem"). Overbooking é impedido pelo mesmo princípio de sempre
(`SELECT ... FOR UPDATE` no recurso disputado antes de somar as reservas ativas e decidir — provado
sob concorrência real), e conflito de horário na agenda do próprio passageiro é uma política
separada, independente de capacidade. Racional completo em
[ADR-0014](docs/architecture/decisions/0014-onboard-activity-reservations.md).

```bash
# partySize sempre explícito; a reserva precisa estar CONFIRMED.
curl -s -X POST localhost:3333/bookings/$BOOKING/event-reservations/$EVENT \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"partySize":2}'
curl -s -X POST localhost:3333/bookings/$BOOKING/dining-reservations \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"diningSlotId":"'"$SLOT"'","partySize":2,"reservationDate":"2027-10-03"}'
```

## Status

Fase atual: bootstrap do monorepo, camada de persistência, autenticação/autorização, módulo de
catálogo, frontend público, mapa interativo do navio, motor de disponibilidade de cabine, domínio
de Booking, motor de preços, checkout completo, ingresso digital com check-in e experiência interna
do cruzeiro (eventos/restaurantes) concluídos — frontend e backend sobem localmente, banco modelado
e migrado, seed de demonstração funcionando, auth completa (cadastro, login, refresh com rotação,
logout, recuperação de senha) com RBAC por papel e por posse de recurso — agora também com login
funcional no frontend (`/login`, sessão via refresh silencioso, sem token em storage persistente) —,
catálogo completo (cruzeiros com publish/unpublish/filtros/paginação/ordenação), frontend público
(Home, exploração, detalhe, mapa do navio) integrado à API real, hold de cabine com garantia real
contra concorrência, reserva completa (hóspedes, adicionais, preço com desconto/taxa), checkout via
`PaymentGateway` simulado (aprovação/recusa/timeout/retry tratados, idempotência testada com
corridas reais), ingresso digital com QR Code e check-in do Staff por código (uso único garantido
sob concorrência real, interface dedicada em `/organizador/check-in`), e reserva de eventos/
restaurantes a bordo com overbooking e conflito de horário impedidos sob concorrência real
(interface dedicada em `/reservas`, verificada em navegador de verdade), health check e
documentação de API no ar. Gateway de pagamento real (Stripe/Mercado Pago de verdade), leitura de
QR Code por câmera e notificações continuam fora de escopo. Ver `docs/DEVLOG.md` para o histórico e
`docs/product/BACKLOG.md` para o roadmap priorizado.
