# ADR-0014: Experiência interna do cruzeiro (eventos, restaurantes, experiências)

## Status
Aceito

## Contexto
Eventos, restaurantes e experiências já existiam como catálogo de LEITURA (`Event`, `Restaurant`,
`Experience`, expostos na página pública do cruzeiro) desde etapas anteriores. Faltava o núcleo
pedido nesta etapa: deixar o passageiro efetivamente **reservar** essas atividades para a sua
viagem já confirmada, com proteção real contra overbooking (capacidade) e contra conflito de
horário na agenda do próprio passageiro — nenhuma das duas coisas existia antes.

## Dois tipos de reserva, arquiteturas deliberadamente diferentes
- **Eventos e restaurantes**: reserváveis a qualquer momento *depois* da reserva confirmada — "quero
  ir a este show", "quero jantar aqui nesta data" são decisões que fazem sentido tomar durante a
  viagem, não só no checkout. Por isso ganharam um módulo novo (`modules/activities`) com rotas
  próprias de criar/cancelar, independentes do ciclo de vida de `Booking`.
- **Experiências** (`Experience`): continuam selecionadas em `BookingsService.updateDetails`
  (ADR-0010), que só opera em reservas `HELD` (pré-checkout) — não uma mudança de escopo, mas a
  constatação de que o mecanismo já existente já cobre "possuir nome, descrição, duração,
  capacidade, preço" e, com esta etapa, também disponibilidade (abaixo). Reabrir a seleção de
  experiências depois de `CONFIRMED` exigiria decidir semântica de repreço/reembolso parcial fora do
  escopo pedido; a fronteira atual (fixado no checkout, como já era) foi mantida.

## Novidade no schema: `partySize`, `EventReservation`, `DiningReservation`
- `BookingExperience.partySize` (novo, `@default(1)`): quantas pessoas da reserva participam de
  cada experiência — antes só existia `priceAtBooking`. Congelado no momento da seleção
  (`updateDetails`), sempre `input.guests.length`, nunca um valor vindo do cliente — mesmo padrão já
  estabelecido para `priceAtBooking` (ADR-0010, "congela no momento da seleção").
- `EventReservation` / `DiningReservation` (novos): `bookingId`, `partySize`, `status`
  (`CONFIRMED`/`CANCELLED`), `cancelledAt`. `DiningReservation` também tem `reservationDate` — um
  `DiningSlot` é um horário *recorrente* (`startTime`/`endTime` como `@db.Time`, sem data), uma
  reserva de verdade precisa de uma data específica da viagem. Restrições de unicidade compostas
  (`@@unique([eventId, bookingId])`, `@@unique([diningSlotId, bookingId, reservationDate])`) tornam
  "a mesma reserva reservando a mesma coisa duas vezes" um upsert idempotente, não uma corrida
  contra o banco.
- `Event.durationMinutes` (novo, opcional): campo que faltava para "eventos deverão possuir [...]
  duração" — `startAt`/`endAt` já implicam duração, mas o pedido lista o campo explicitamente.

## "Crie mecanismos para evitar overbooking" — mesmo princípio de sempre, uma vez mais
`ActivityCapacityPolicy.assertHasCapacity({ capacity, alreadyReserved, partySize })` — lógica pura,
`capacity == null` = sem limite. Quem decide contra corrida de verdade é sempre a mesma estratégia
de ADR-0009/0010/0012/0013: `SELECT ... FOR UPDATE` na linha do RECURSO compartilhado (`Event` ou
`DiningSlot`) antes de somar `partySize` das reservas ativas e decidir — nunca uma leitura solta
seguida de escrita. `ActivitiesRepository.lockEventForUpdate`/`lockDiningSlotForUpdate` travam;
`sumActiveEventPartySize`/`sumActiveDiningPartySize` somam DEPOIS da trava adquirida. Provado com
`Promise.all` verdadeiramente concorrente (sem `await` entre os disparos) em
`activities.e2e-spec.ts`: N reservas disputando uma capacidade menor que N — exatamente `capacity`
vagas preenchidas, nunca mais, com o banco (não só a resposta HTTP) como prova final.

A mesma proteção foi estendida para `Experience.capacity`, dentro de `BookingsService.updateDetails`
(não em `activities`, para não separar a validação do restante do fluxo de hóspedes/preço que já
mora ali): `BookingsRepository.lockExperiencesForUpdate` trava TODAS as `Experience` selecionadas
de uma vez, **em ordem estável de id** — evita deadlock entre duas `updateDetails` concorrentes que
selecionam experiências sobrepostas em ordens diferentes, o mesmo cuidado que já existia
implicitamente quando só uma cabine era travada por vez.

## "Conflitos de horário" — uma regra distinta de capacidade, deliberadamente separada
Capacidade protege o RECURSO ("o teatro não pode vender mais lugares do que tem"); conflito de
horário protege a AGENDA DO PASSAGEIRO ("não posso estar em dois lugares ao mesmo tempo"). São
políticas de domínio puras e independentes: `ActivitySchedulingPolicy.assertNoConflict` faz o teste
clássico de sobreposição de intervalos (`existing.start < candidate.end && candidate.start <
existing.end`) contra todas as janelas já ativas da MESMA reserva (`findBookingTimeWindows`, que
junta `EventReservation` + `DiningReservation` confirmadas). Intervalos que só se tocam na borda (um
termina exatamente quando o outro começa) **não** contam como conflito, de propósito — dá para ir
de um evento direto para outro. Um `DiningSlot` recorrente vira uma janela absoluta comparável via
`diningSlotWindowOn(reservationDate, startTime, endTime)`, que também trata o caso (raro, mas
permitido pelo schema) de um horário atravessar a meia-noite.

`assertDateWithinCruise` complementa isso para restaurantes: a `reservationDate` escolhida precisa
cair dentro do período real de navegação (`embarkationDate`..`disembarkationDate`) — comparação só
por dia, os dias de embarque/desembarque contam inteiros.

## Reservas são "criar" + "cancelar explícito", não "editar in-place"
Reenviar a MESMA reserva (mesmo `partySize`) é um retry idempotente (devolve a reserva existente,
sem tocar o banco de novo). Reenviar com um `partySize` DIFERENTE numa reserva já `CONFIRMED` é
rejeitado (`409`, "cancele a reserva atual antes de mudar") — decisão deliberada em troca de uma
pequena inconveniência de UX: excluir "a própria reserva anterior desta mesma reserva" tanto da
soma de capacidade quanto da checagem de conflito de horário exigiria parâmetros de exclusão em
cada consulta, uma complexidade que "cancelar e reservar de novo" evita por completo — o usuário já
tem os dois botões na tela (ver frontend, abaixo).

## Arquitetura em camadas (`modules/activities`) — mesmo padrão de sempre
`domain/` (`ActivityCapacityPolicy`, `ActivitySchedulingPolicy`, `dining-schedule.util.ts` — puros,
sem dependência de runtime do Prisma além de tipos) → `persistence/` (`ActivitiesRepository` — todo
lock e SQL cru) → `application/` (`ActivitiesService` — abre a transação, orquestra política +
repositório) → `presentation/` (`ActivitiesController`, rotas aninhadas em
`/bookings/:bookingId/event-reservations` e `/bookings/:bookingId/dining-reservations`, mesmo
padrão de `CheckInController` morar dentro de `TicketsModule` mas expor rotas `/check-in/...`). CRUD
de `DiningSlot` para o organizador (`POST /restaurants/:id/dining-slots`, `PATCH
/dining-slots/:id`) não existia antes desta etapa — adicionado no mesmo módulo, com checagem de
posse (o navio do restaurante precisa pertencer ao organizador autenticado).

## Frontend: `/reservas` — "Minha viagem"
Primeira página do frontend a juntar leitura autenticada (`GET /bookings/me`, reutiliza o
`AuthProvider`/`RequireRole` construídos em ADR-0013) com o catálogo público já existente
(`getCruiseBySlug`, que já trazia `events`/`experiences`/`ship.restaurants[].diningSlots` — nenhuma
rota nova de leitura de catálogo foi necessária). Mostra a reserva confirmada mais recente do
passageiro, as experiências já selecionadas no checkout (somente leitura, ver seção acima), e duas
listas com formulário de adicionar + botão de cancelar por item — eventos e restaurantes. Toda
validação (capacidade, conflito, data fora do período) é feita pela API; o frontend só exibe a
mensagem de erro que a API devolve, nunca decide sozinho.

## Testes
- **Unitários**: `activity-capacity.policy.spec.ts`, `activity-scheduling.policy.spec.ts`,
  `dining-schedule.util.spec.ts` (políticas puras) e `activities.service.spec.ts` (orquestração com
  repositório mockado — capacidade, conflito, ownership, idempotência, cancelamento). Extensão de
  `bookings.service.spec.ts` para a nova checagem de capacidade de `Experience` dentro de
  `updateDetails`.
- **Integração** (`activities.e2e-spec.ts`, Postgres/Redis reais): fluxo completo de reserva e
  cancelamento de evento e restaurante; reserva pertencente a outro cruzeiro (409); reserva em
  reserva de outro usuário (404); retry idempotente; cancelar e reservar de novo; **overbooking sob
  concorrência real** (`Promise.all` verdadeiro) tanto para eventos quanto para restaurantes; data
  de reserva fora do período do cruzeiro; capacidade por data (não global) de um `DiningSlot`;
  conflito de horário entre evento e restaurante na mesma reserva, incluindo o caso de borda que
  NÃO é conflito; CRUD de `DiningSlot` restrito ao organizador dono do navio.

## Consequências
- Adicionar uma nova `Experience` a uma reserva já `CONFIRMED` continua fora de escopo (ver seção
  acima) — extensão natural seria um novo endpoint `POST /bookings/:id/experiences` espelhando o
  padrão de eventos/restaurantes, se o produto decidir que faz sentido depois do checkout.
  Compatível com a estrutura desta etapa; deliberadamente adiado por não ter sido pedido diretamente
  e para não redesenhar repreço/reembolso parcial sem escopo claro.
