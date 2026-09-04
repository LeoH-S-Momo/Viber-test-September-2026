# ADR-0019: Eventos de domínio/aplicação e infraestrutura de notificações

## Status
Aceito

## Contexto
Pedido explícito do usuário: introduzir eventos de domínio/aplicação "onde fizer sentido" (com
`BOOKING_CREATED`, `PAYMENT_APPROVED`, `PAYMENT_FAILED`, `BOOKING_CONFIRMED`, `TICKET_GENERATED`,
`CHECKIN_COMPLETED`, `EVENT_BOOKED`, `BOOKING_CANCELLED` como exemplos, não uma lista fechada);
consumidores/processadores para os eventos relevantes; notificações de confirmação de reserva,
pagamento aprovado, pagamento recusado, ticket disponível, lembrete de embarque, alteração de
evento e cancelamento; MailHog (ou equivalente) para inspecionar e-mail em dev; uso do
Redis/BullMQ já existente na arquitetura; retry, idempotência, tratamento de falhas e
dead-letter (ou estratégia equivalente); e — explicitamente — não transformar tudo em assíncrono
sem necessidade, com a divisão síncrono/assíncrono justificada.

Antes desta mudança: o schema já tinha `Notification`/`NotificationType`/`NotificationChannel`
(nunca usados por nenhum código), `AuditLogService` (síncrono, global, já o precedente de "grave
um fato sobre o que aconteceu" — mas para auditoria, não para notificar ninguém), e duas filas
BullMQ (`cabin-hold-expiration`, `ticket-issuance`) sem `attempts`/`backoff` configurados (o
default do BullMQ é 1 tentativa, sem retry) — nenhuma delas precisava de retry porque seus efeitos
colaterais de falha são absorvidos de outro jeito (ver ADR-0009/0012). Nenhum `EventEmitter`,
nenhum SMTP, nenhum serviço de e-mail existia.

## Duas camadas, dois propósitos — não confundir "evento" com "fila"

**Eventos de domínio (`EventEmitter2`, síncrono, in-process)** — declaram um FATO ("uma reserva
foi confirmada"), emitidos com `this.eventEmitter.emit(DomainEvent.X, payload)` sempre DEPOIS que
a transação que mudou o estado já deu commit (nunca de dentro de um `prisma.$transaction` — evitar
notificar sobre algo que a transação pode não ter persistido de verdade). Não fazem I/O de rede,
não podem falhar de um jeito que precise de retry, e não sobrevivem a um restart do processo — e
está tudo bem, porque a única coisa que emitir um evento faz é chamar funções JS na mesma memória,
no mesmo tick. `BookingsService`, `TicketsService`, `ActivitiesService`, `EventsService` (catálogo)
e `AdminSalesService` emitem 9 eventos (`domain-events/domain-events.ts`) sem NENHUM saber que
notificações existem — zero import de `NotificationsModule` em qualquer um deles.

**Fila de notificações (`BullMQ`, assíncrona, persistida no Redis)** — só o ENVIO DE E-MAIL de
verdade passa por aqui (`NotificationsProcessor`, fila `notifications`). Essa é a parte que faz
I/O de rede real (SMTP), pode falhar de forma transitória (servidor fora do ar, timeout) e
precisa sobreviver a um restart do worker — exatamente as garantias que uma fila persistida dá e
um `emit()` em memória não dá.

`NotificationsDomainEventsListener` é a ponte: escuta os eventos que viram notificação (nem todos
viram — ver abaixo) via `@OnEvent`, e delega para `NotificationsService`, que (a) monta o
conteúdo, (b) grava a linha `Notification` (rápido, síncrono, Postgres local) e (c) só ENTÃO
enfileira o job que manda o e-mail de verdade.

## Por que só alguns eventos viram notificação

| Evento | Vira notificação? | Por quê |
|---|---|---|
| `BOOKING_CREATED` | Não | Um hold ainda não é um compromisso — avisar por e-mail toda vez que alguém clica "reservar" (antes até de preencher hóspedes) seria ruído, não sinal. |
| `PAYMENT_APPROVED` | **Sim** — "pagamento aprovado" | Pedido explícito. |
| `PAYMENT_FAILED` | **Sim** — "pagamento recusado" | Pedido explícito. |
| `BOOKING_CONFIRMED` | **Sim** — "confirmação da reserva" | Pedido explícito. |
| `TICKET_GENERATED` | **Sim** — "ticket disponível" | Pedido explícito. |
| `CHECKIN_COMPLETED` | Não | Não estava na lista de notificações pedidas; o próprio ato de embarcar já é confirmado na hora, pela equipe, na tela — um e-mail depois seria redundante. |
| `EVENT_BOOKED` | Não | Reservar um show já devolve confirmação síncrona na hora (ver `ActivitiesController`) — o valor de um e-mail aqui é baixo comparado aos 4 acima. |
| `BOOKING_CANCELLED` | **Sim** — "cancelamento" | Pedido explícito. |
| `EVENT_UPDATED` (não estava nos exemplos) | **Sim** — "alteração de evento" | Precisa existir PORQUE "alteração de evento" estava na lista de notificações pedidas — sem um evento de domínio pra representar "um Event mudou", essa notificação não teria de onde nascer. |

`BOOKING_CREATED` e `CHECKIN_COMPLETED` são emitidos mesmo sem listener hoje — são fatos de
domínio genuínos (úteis pra auditoria, analytics, ou um listener futuro), não "só existem porque
uma notificação precisa deles". Isso é o próprio valor de separar "evento" de "efeito colateral":
adicionar uma notificação de check-in no futuro não vai exigir tocar em `TicketsService` de novo,
só adicionar um `@OnEvent(DomainEvent.CHECKIN_COMPLETED)` novo em `NotificationsDomainEventsListener`.

"Pagamento recusado" e "cancelamento" são deliberadamente DOIS eventos/notificações separados, não
um só: quando um pagamento é recusado, o código cancela a reserva automaticamente (libera a
cabine) — mas emitir `BOOKING_CANCELLED` ali TAMBÉM mandaria um segundo e-mail "sua reserva foi
cancelada" logo depois de "seu pagamento foi recusado", que é confuso e redundante pro usuário (o
recusado já explica o que aconteceu e convida a tentar de novo). `BOOKING_CANCELLED` fica reservado
pra cancelamento explícito (passageiro ou admin), nunca a liberação automática por recusa de
pagamento.

## Lembrete de embarque: o único gatilho por TEMPO, não por evento

"Lembrete de embarque" não é reação a nada que aconteceu — é um aviso futuro. Resolvido reusando o
MESMO padrão que `CABIN_HOLD_EXPIRATION_QUEUE` já usa (ADR-0009): um job BullMQ **atrasado**
(`delay` = até `BOOKING_CONFIRMED_HOURS_BEFORE`/`BOARDING_REMINDER_HOURS_BEFORE` antes do
embarque), agendado no momento em que `NotificationsDomainEventsListener` reage a
`BOOKING_CONFIRMED`. Quando o delay vence (dias depois, possivelmente), o job **reconfirma que a
reserva ainda está `CONFIRMED`** antes de gerar a notificação de verdade — mesmo princípio
defensivo de `CabinHoldExpirationProcessor.process`: nada garante que a reserva não foi cancelada
no meio do caminho, então o job nunca assume que ainda é válido só por ter disparado.

Preferido a introduzir `@nestjs/schedule`/cron só para este único caso — o codebase já tinha o
padrão "delay no BullMQ + reconfirmar estado ao disparar" resolvido e testado (ADR-0009); reusar é
menos código novo e menos um conceito a mais pra quem for ler o projeto depois.

## Retry, idempotência, dead-letter (`NotificationsProcessor`)

- **Retry**: a fila `notifications` é registrada com `attempts: 5` e `backoff: { type:
  'exponential', delay: 3000 }` (3s, 6s, 12s, 24s, 48s) — falha transitória de SMTP (MailHog fora
  do ar, timeout de rede) se resolve sozinha na maioria dos casos.
- **Idempotência em duas camadas**: (1) o `jobId` do envio é determinístico
  (`email-${notification.id}` — BullMQ recusa `:` num Custom Id, então `-` é o separador em todo
  `jobId` desta fila), então enfileirar duas vezes pra MESMA notificação é um no-op
  enquanto o primeiro job ainda está esperando/ativo; (2) o processor confere
  `notification.deliveryStatus` ANTES de mandar o e-mail — se já é `SENT`, retorna sem reenviar.
  A camada (2) é a que realmente importa: cobre o caso em que o e-mail foi enviado com sucesso mas
  a escrita "marca como enviado" falhou antes de persistir (processo derrubado no meio, por
  exemplo) e um retry tentaria reenviar sem ela. Essa mesma disciplina foi replicada em
  `TicketsService.issueTicketsForBooking`: o evento `TICKET_GENERATED` só dispara se o número de
  tickets já emitidos ANTES da chamada for menor que o número de hóspedes — sem isso, um retry do
  job de emissão de ticket (que já é idempotente pro BANCO, upsert por hóspede) reenviaria "seu
  ingresso está pronto" numa tentativa que não criou nada novo.
- **Tratamento de falha**: falha de tentativa 2 de 5 é só um `logger.warn` + o erro repropagado
  (deixa o BullMQ reagendar) — nunca marca a notificação como `FAILED` numa tentativa que ainda
  não é a última; isso só aconteceria uma vez e distorceria o dado.
- **Dead-letter**: quando a ÚLTIMA tentativa esgota (`job.attemptsMade >= attempts`, verificado no
  handler `@OnWorkerEvent('failed')`), três coisas acontecem juntas: a `Notification` vira
  `deliveryStatus: FAILED` (com o erro guardado), um `AuditLog` é gravado
  (`notification.email_dead_lettered`), e o job entra numa fila SEPARADA,
  `notifications-dead-letter`, consumida por `NotificationsDeadLetterProcessor`. A fila dedicada
  (em vez de só logar) foi escolhida porque deixa a falha inspecionável de verdade via
  Redis/BullMQ (um Bull Board apontaria pra ela sem nenhum código novo) — é onde, numa versão de
  produção, entraria um alerta real (Slack, PagerDuty); aqui ela só loga em nível `error`, porque
  ir além disso não foi pedido.

## Síncrono vs. assíncrono — o que é cada um e por quê

O pedido foi explícito: "não transforme tudo em assíncrono sem necessidade" e explicar a divisão.

**Fica síncrono (bloqueia a resposta HTTP, roda na mesma request):**
- Toda a lógica de negócio que já existia (validar, travar linha, escrever no Postgres dentro de
  uma transação) — nada disso mudou.
- **A emissão do evento de domínio em si** (`eventEmitter.emit(...)`) — é uma chamada de função em
  memória, não uma chamada de rede; bloquear nela seria imperceptível (microssegundos) e não há
  ganho nenhum em adiar algo que não tem I/O.
- **A gravação da linha `Notification`** (dentro de `NotificationsService.createAndEnqueue`) — é
  uma escrita local no MESMO Postgres que a request já está usando; colocar isso numa fila só
  adicionaria uma volta a mais no Redis pra economizar um insert que já é rápido.

**Fica assíncrono (fila BullMQ, fora do caminho da resposta HTTP):**
- **O envio do e-mail em si** (SMTP) — é I/O de rede pra um serviço externo, pode ser lento (a
  latência de um SMTP real varia de dezenas de ms a segundos) e pode falhar de forma transitória.
  Bloquear o checkout/confirmação de reserva esperando o SMTP responder acoplaria a confiabilidade
  do fluxo de compra à disponibilidade de um sistema de terceiros — exatamente o tipo de
  acoplamento que uma fila existe pra evitar. Retry automático só faz sentido pra algo que pode
  falhar de forma transitória E que vale a pena tentar de novo sozinho — e-mail é o caso canônico.
- **O lembrete de embarque** — por definição só pode ser assíncrono (é um evento no FUTURO, não
  algo que a request atual possa "esperar").
- A emissão de ingresso (`TICKET_ISSUANCE_QUEUE`) e a expiração de hold
  (`CABIN_HOLD_EXPIRATION_QUEUE`) já eram assíncronas antes desta mudança (ADR-0009/ADR-0012) —
  mantidas como estavam, mesmo raciocínio (nenhuma delas precisa bloquear a resposta ao usuário).

Importante notar o que **continua** síncrono mesmo fazendo parte do fluxo de pagamento:
`PaymentGateway.charge()` em si (ADR-0012) — o usuário precisa saber na hora se o cartão foi
aprovado ou recusado, então essa chamada específica bloqueia a resposta do checkout por design, e
isso não mudou aqui. A notificação SOBRE o resultado (o e-mail) é que é assíncrona; o resultado em
si (o que a tela mostra pro usuário) continua vindo síncrono, na mesma resposta HTTP.

## MailHog em desenvolvimento

Sem Docker nesta máquina (ver `.claude/skills/seapass-local-infra/SKILL.md`) — MailHog roda como
um binário Windows portátil (`C:\Users\Leo\mailhog\MailHog.exe`), SMTP em `:1025`, UI web em
`http://localhost:8025`. Diferente de Postgres/Redis, **não foi registrado como serviço Windows**:
MailHog não guarda nada que precise sobreviver a um reboot (é uma caixa de entrada em memória,
existe só pra inspecionar o que seria enviado) — perder o processo não perde dado nenhum, só a
sessão de inspeção atual, então um processo em segundo plano (reiniciado no começo de cada sessão
de dev, ver o SKILL.md atualizado) é suficiente e mais simples que instalar mais um serviço.
`MailerService` aponta pra ele por padrão (`SMTP_HOST=localhost`, `SMTP_PORT=1025`) — nenhuma
credencial real precisa existir em dev, MailHog aceita qualquer coisa e nunca entrega de verdade.

## Consequências

- `Notification` ganhou `deliveryStatus`/`deliveryError`/`sentAt`/`htmlBody` (migrations
  `20260904150000_notifications_delivery_status` e `20260904150100_notification_html_body`) — o
  registro de "isto deveria ter sido notificado" existe mesmo que o SMTP esteja fora do ar.
- `GET /notifications/me` (novo, `NotificationsController`) — qualquer usuário autenticado vê seu
  próprio histórico de notificações (status de entrega incluso), sem precisar de acesso a e-mail
  nenhum pra conferir o que o sistema tentou mandar.
- `NotificationsModule` é totalmente auto-contido — nenhum outro módulo o importa; a única
  dependência na direção contrária é `EventEmitter2` (global, via `EventEmitterModule.forRoot()`
  em `AppModule`), injetável em qualquer service sem import nenhum.
- `test/integration/notifications.e2e-spec.ts` (novo) verifica o pipeline fim-a-fim contra
  infraestrutura real (Postgres, Redis, MailHog) — inclusive consultando a API REST do próprio
  MailHog (`GET http://localhost:8025/api/v2/messages`) pra confirmar que o e-mail chegou de
  verdade, não só que o job rodou sem erro.
