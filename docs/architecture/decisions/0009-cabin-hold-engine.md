# ADR-0009: Motor de disponibilidade de cabine (hold, concorrência, expiração)

## Status
Aceito

## Contexto
O mapa do navio (ADR-0008) já calculava disponibilidade de cabine *para leitura*
(`AVAILABLE`/`ON_HOLD`/`BOOKED`/`UNAVAILABLE`), mas nada *escrevia* essas transições — não
existia criação de reserva. Este pedido é explícito e crítico: implementar o motor completo —
consulta, criação de hold temporário, expiração, confirmação, cancelamento e liberação — com a
garantia central de que **duas pessoas não podem reservar a mesma cabine simultaneamente**.

## Terminologia: `PENDING` virou `HELD`
O enum `BookingStatus` tinha `PENDING` fazendo dupla função (era usado tanto como "o pagamento
está pendente" quanto, na prática, como "esta é uma reserva temporária/hold"). O pedido nomeia os
3 estados explicitamente como `AVAILABLE`/`HELD`/`BOOKED` — em vez de manter `PENDING` no schema e
só *chamar* isso de "hold" em comentários (o que já estava acontecendo e é confuso), o valor do
enum foi **renomeado** para `HELD` via `ALTER TYPE "BookingStatus" RENAME VALUE 'PENDING' TO
'HELD'` (migration `20260903135756_add_cabin_hold_engine`) — Postgres rerotula as linhas
existentes automaticamente, sem backfill. `BOOKED` continua sendo o rótulo *de leitura* projetado
a partir de `BookingStatus.CONFIRMED` (ver `CabinAvailabilityPolicy`, ADR-0008) — "confirmada" é
mais preciso como nome de estado da reserva em si; "reservada" é como isso é comunicado pra fora.

## Decisão central: qual estratégia evita overbooking, e por quê
Avaliadas três estratégias (o pedido pede para justificar a escolhida e explicar por que evita
overbooking):

1. **Lock distribuído no Redis** (`SET cabin:{id}:lock NX PX ...`) antes de tocar o Postgres.
   Descartado como mecanismo *primário*: o Postgres já é a fonte da verdade (tabela `bookings`,
   transacional); um lock Redis por cima não fortalece a garantia de integridade relacional que o
   próprio banco já oferece nativamente — só adiciona uma segunda fonte de verdade (TTL do lock
   vs. estado real da linha) que pode divergir (processo cai entre travar o lock e commitar a
   transação, lock expira sozinho, etc.). Seria exatamente o tipo de "solução artificial" que o
   pedido pede para evitar — uma peça a mais sem reforçar a garantia real.
2. **Constraint único simples** (`@@unique([cabinId, cruiseId])` do Prisma). Descartado sozinho:
   bloquearia para sempre depois da primeira reserva daquela cabine+cruzeiro, mesmo depois dela
   ser cancelada/expirada — reservas `CANCELLED`/`REFUNDED` de tentativas anteriores (hold
   abandonado, troco de plano) precisam poder se acumular livremente.
3. **Transação + `SELECT ... FOR UPDATE` + índice único PARCIAL como rede de segurança** — a
   escolhida.

### Como funciona, mecanicamente
`BookingsService.holdCabin` (chamado a partir de `POST /cruises/:slug/cabins/:cabinId/hold`) abre
uma transação Prisma (`prisma.$transaction(async (tx) => ...)`) e, dentro dela:

1. **`SELECT id, status, "cabinCategoryId" FROM cabins WHERE id = $1 FOR UPDATE`** — trava a linha
   da cabine. Uma segunda transação concorrente que tente travar a **mesma** cabine bloqueia neste
   ponto até a primeira commitar ou abortar (comportamento nativo de row-lock do Postgres, válido
   sob o isolation level padrão `READ COMMITTED` — não precisa de `SERIALIZABLE` porque o padrão
   aqui é *lock-then-read-then-write*, não *read-then-lock*).
2. **Expira inline qualquer hold antigo** desta cabine+cruzeiro cujo `holdExpiresAt` já passou
   (`UPDATE bookings SET status = 'CANCELLED', ... WHERE cabinId = $1 AND cruiseId = $2 AND status
   = 'HELD' AND "holdExpiresAt" <= now()`), ainda dentro da mesma transação/lock.
3. **Verifica se sobra alguma reserva ativa** (`HELD` ou `CONFIRMED`) para esta cabine+cruzeiro.
   Se sim, `ConflictException` (409) — a transação é abortada, a linha da cabine é destravada.
4. Busca o preço real (`CruiseCabinPricing` da categoria da cabine, para *este* cruzeiro — nunca
   aceito do cliente) e cria a reserva `HELD` com `holdExpiresAt = now + CABIN_HOLD_MINUTES`.
5. Commit — a segunda transação (que estava bloqueada no passo 1) agora prossegue, re-lê o estado
   (já commitado) no passo 3, encontra a reserva recém-criada e recebe 409.

**Por que isto de fato evita overbooking**: a garantia não vem de "checar antes de escrever" (que
é vulnerável a corrida — as duas transações poderiam checar antes de qualquer uma escrever) — vem
de **travar antes de checar**. O lock na linha da cabine serializa completamente as duas tentativas
concorrentes: elas deixam de ser concorrentes na prática, uma literalmente espera a outra
terminar. Não existe janela de tempo em que as duas transações veem "disponível" ao mesmo tempo.

### Índice único parcial — rede de segurança, não o mecanismo principal
```sql
CREATE UNIQUE INDEX "booking_active_cabin_per_cruise"
  ON "bookings" ("cabinId", "cruiseId")
  WHERE "status" IN ('HELD', 'CONFIRMED');
```
Parcial (não um `@@unique` comum do Prisma, que não suporta `WHERE`) porque reservas
`CANCELLED`/`REFUNDED`/`COMPLETED` da mesma cabine+cruzeiro precisam poder se acumular. Mesmo que
um bug futuro no código da aplicação pule o lock/transação (ex: alguém escreve uma migration de
dados, um script administrativo direto no banco, um novo endpoint que esquece de travar), o
Postgres recusa fisicamente uma segunda linha `HELD`/`CONFIRMED` para o mesmo par — o
`BookingsService.holdCabin` captura esse erro (`Prisma.PrismaClientKnownRequestError` código
`P2002`) e o traduz para o mesmo 409 de negócio, nunca um 500 cru.

## Expiração: por que precisa ser ativa, não só "ignorada na leitura"
`CabinAvailabilityPolicy` (ADR-0008) já tratava um hold `HELD` expirado como `AVAILABLE` — mas só
*para leitura*. Se a expiração fosse *só* uma projeção de leitura (sem nunca cancelar a linha de
verdade), o índice único parcial acima bloquearia um novo hold *para sempre* depois que o antigo
expirasse, porque o índice não sabe nada sobre tempo (`holdExpiresAt <= now()` não pode entrar no
predicado de um índice parcial — `now()` não é uma função imutável, o Postgres recusa). Por isso a
expiração precisa **efetivamente cancelar** a linha antiga em algum momento. Duas camadas:

1. **Expiração inline "sob demanda"** (passo 2 acima, dentro de `holdCabin`) — é o que **garante
   corretude**: a próxima pessoa que tentar seria bloqueada pelo hold morto passa a conseguir,
   porque o hold morto é cancelado antes da checagem de conflito, na mesma transação/lock.
2. **Job agendado no BullMQ** (`CabinHoldExpirationProcessor`, fila `cabin-hold-expiration`) — ao
   criar um hold, `holdCabin` agenda um job com `delay = holdExpiresAt - now` e `jobId =
   booking.id` (idempotente — um novo agendamento para o mesmo id substitui o anterior). Ao
   confirmar/cancelar/liberar, o job agendado é removido (`queue.remove(bookingId)`,
   best-effort). O processor chama `BookingsService.expireHoldIfStillPending`, que **re-confirma
   o estado** antes de agir (a reserva pode já ter sido confirmada por outra via entre o
   agendamento e a execução do job) — isto é só uma **melhoria de UX** (a cabine fica livre na
   tela de quem está navegando logo depois do prazo, sem precisar que alguém tente reservá-la de
   novo pra "destravar"). Uma falha aqui (Redis fora do ar, job perdido) nunca compromete
   corretude — só atrasa quando a cabine *parece* livre de novo, até a próxima tentativa de hold
   fechar o ciclo pela camada 1.

### Por que uma conexão Redis dedicada para o BullMQ
`RedisService` (usada pelo health check e por qualquer cache futuro) é configurada com
`maxRetriesPerRequest: 1` (falha rápido, filosofia da app: nunca travar o processo esperando
Redis). O BullMQ exige `maxRetriesPerRequest: null` para os comandos bloqueantes do `Worker` —
usar a mesma conexão quebraria uma das duas necessidades. `app.module.ts` cria uma segunda
instância `ioredis` dedicada, só para o `BullModule.forRootAsync`.

### `CABIN_HOLD_MINUTES` configurável
Nova variável de ambiente (`env.schema.ts`, default `15`) — `CabinHoldPolicy.computeHoldExpiry`
recebe o valor como parâmetro (não lê `ConfigService` diretamente: a policy continua pura, sem
Prisma/NestJS injetado, no mesmo espírito de `CruiseStatusPolicy`/`CabinAvailabilityPolicy* — quem
lê a config é a camada de aplicação (`BookingsService`).

## "Cancelamento" vs. "liberação" — por que dois endpoints, não um
Ambos terminam em `CANCELLED`, mas guardas diferentes:
- **`releaseHold`** (`POST /bookings/:id/release`) só aceita partir de `HELD` — abandonar um hold
  antes de confirmar. Tentar liberar uma reserva `CONFIRMED` dá 409 com uma mensagem apontando
  para `cancel` em vez de mascarar o erro.
- **`cancelBooking`** (`POST /bookings/:id/cancel`) aceita `HELD` **ou** `CONFIRMED` — a ação
  genérica "não quero mais esta reserva". Aceita um `reason` opcional (`CancelBookingSchema`).

Distinguir os dois deixa a razão de cancelamento (`cancellationReason`) honesta na base de dados
("Hold liberado pelo usuário" vs. "Cancelada pelo usuário" vs. "Hold expirado automaticamente")
em vez de um único verbo genérico escondendo qual dos três realmente aconteceu.

## Camadas (segue ADR-0006)
`bookings/` ganhou a mesma separação de 4 camadas do catálogo — módulo pequeno até agora (só
`GET /bookings/me`), mas a complexidade real introduzida aqui (transação, lock, máquina de
estados, fila) justifica:
- **`domain/cabin-hold.policy.ts`** — puro: cálculo de expiração e guardas de transição
  (`assertCanConfirm`/`assertCanCancel`/`assertCanRelease`/`assertOwnership`), testado isolado
  (`cabin-hold.policy.spec.ts`, 18 casos).
- **`persistence/bookings.repository.ts`** — toda query que participa da máquina de estados
  recebe `tx: Prisma.TransactionClient` explícito (nunca o client "solto"), incluindo as duas
  únicas queries raw (`FOR UPDATE`) de todo o backend.
- **`application/bookings.service.ts`** — orquestra: abre a transação, decide, agenda/cancela o
  job. Testado com repositório mockado (`bookings.service.spec.ts`, 16 casos).
- **`presentation/bookings.controller.ts`** — rotas `cruises/:cruiseSlug/cabins/:cabinId/
  availability|hold` e `bookings/:id/confirm|cancel|release`, seguindo o mesmo padrão de
  `@Controller()` sem prefixo + path completo por rota já usado por `DecksController`/
  `VenuesController`.

A fila/processor (`jobs/cabin-hold-expiration.processor.ts`) é registrada dentro de
`BookingsModule` (não um `JobsModule` separado importando `BookingsModule` — isso criaria um
ciclo, já que `BookingsService` também precisa da fila para enfileirar) — `jobs/` continua sendo a
convenção de *onde* o arquivo do processor mora (`jobs/README.md`), não necessariamente um
`NestModule` próprio.

## Testes de concorrência (o pedido explícito)
`test/integration/cabin-hold-concurrency.e2e-spec.ts`, contra Postgres/Redis reais (não mockados):
dispara `Promise.all` de **12 tentativas de hold verdadeiramente simultâneas** (sem `await` entre
os disparos) para a **mesma cabine**, de 12 passageiros distintos (registrados de verdade via
`/auth/register`), e verifica que **exatamente uma** recebe `201` e as outras 11 recebem `409` —
checado tanto pela resposta HTTP quanto pelo estado real do banco (`SELECT` conta 1 linha
`HELD`). Repete para provar que o lock não vaza (uma nova corrida depois de liberar o vencedor
ainda deixa exatamente 1 passar) e para a corrida em cima da *mesma reserva* (8 tentativas
concorrentes de `confirm`, depois de `release`, na mesma linha) — mesma garantia, outro nível.
`test/integration/bookings.e2e-spec.ts` cobre o ciclo de vida completo fora da corrida: consulta
pública, rejeição em cruzeiro `DRAFT`, cabine em manutenção, posse (usuário B tentando mexer na
reserva de A recebe 404, não 403 — ADR-0005), liberar uma reserva já confirmada, e o fechamento
real do ciclo de expiração (força `holdExpiresAt` pro passado via Prisma direto, sem esperar
`CABIN_HOLD_MINUTES` de verdade, e confirma que um novo hold na mesma cabine sucede e a reserva
velha é cancelada com o motivo certo).

### Nota operacional: `--forceExit` nos testes de integração
O BullMQ mantém a conexão Redis dedicada (acima) e timers internos (checagem de jobs "stalled")
vivos mesmo depois de `app.close()` — Jest nunca via o processo terminar sozinho. `--forceExit`
(adicionado ao script `test:integration`) é a mitigação padrão recomendada pelo próprio Jest para
esta situação, comum em qualquer suite que testa BullMQ de ponta a ponta; os testes já reportaram
passar/falhar antes do force-exit acontecer, então isto não mascara nenhuma falha de asserção.

## Consequências
- `POST /bookings` (checkout completo — pagamento, hóspedes, emissão de ingresso) continua fora de
  escopo, como definido em etapas anteriores — o que foi construído aqui é especificamente o motor
  de disponibilidade/reserva temporária, o pré-requisito que um checkout futuro vai chamar.
- O preço da reserva é sempre derivado do `CruiseCabinPricing` real no momento do hold, nunca
  aceito do cliente — fecha uma classe de vulnerabilidade (adulteração de preço) de graça, como
  consequência de "buscar o preço real" já ser necessário pela regra de negócio.
- `apps/api/.env`/`.env.example` ganharam `CABIN_HOLD_MINUTES=15`; `packages/contracts` ganhou
  `booking/booking.schema.ts` (`CancelBookingSchema`, `BookingStatusSchema`,
  `CabinAvailabilitySchema`) preenchendo o placeholder que já existia em `src/index.ts`.
