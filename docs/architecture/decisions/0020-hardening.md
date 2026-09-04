# ADR-0020: Hardening — segurança, backend, testes e DevOps

## Status
Aceito

## Contexto
Pedido explícito do usuário: uma etapa completa de hardening do SeaPass "como se fosse um
projeto prestes a ser avaliado por uma equipe profissional", cobrindo testes (unitários,
integração, E2E, regras críticas), segurança (SQL injection, XSS, CSRF, exposição de
informação, validação, autenticação, autorização, rate limiting, secrets, CORS, headers,
senhas, tokens, acesso indevido entre organizadores), backend (erros, logs, validação,
paginação, transações, idempotência, concorrência, performance), frontend (loading, erros,
acessibilidade, responsividade, estados vazios, sessão, proteção de rotas) e DevOps (Docker,
Compose, CI, testes automáticos, lint, build, migrations, seed) — com instrução explícita de
**corrigir**, não só listar.

Metodologia: três agentes de auditoria somente-leitura em paralelo (segurança de backend,
arquitetura de backend, frontend) cobriram cada `*.controller.ts`, todo endpoint escopado a
organizador, o filtro global de exceções, o pipeline de logging, todo `page.tsx`, e o estado de
sessão/proteção de rotas — cada achado abaixo foi confirmado por leitura direta do código antes
de ser corrigido (nenhum "conserto" às cegas de um relatório de agente). Docker/Compose/CI e o
levantamento de cobertura de testes foram conduzidos diretamente.

## Segurança

### Cupom redimível em cruzeiro de outro organizador (Alto)
`CouponPolicy.validate` nunca checava `Coupon.organizerId` contra o organizador dono do
cruzeiro sendo reservado — pior, `BookingsRepository.findCouponByCode`/`findCouponById`
*removiam* explicitamente o campo antes de a política sequer vê-lo. Um cupom criado (pelo
admin) escopado ao Organizador A era redimível em qualquer cruzeiro de qualquer organizador,
causando perda de receita e furando a exclusividade de promoção por organizador.

Corrigido: `CouponRecord`/`CouponValidationContext` ganharam `organizerId`/`cruiseOrganizerId`;
uma nova regra em `CouponPolicy.validate` rejeita (mesma mensagem genérica de "cupom não é
válido para este cruzeiro" da regra de `applicableCruiseIds` — não revela ao cliente se o cupom
existe para outro organizador) quando os dois não batem. Checagem por *truthy*, não `!== null`,
de propósito — um cupom global (`organizerId: null`) ou um objeto que simplesmente omite o
campo (`undefined`, comum em fixtures de teste) continuam tratados como "sem restrição".
Coberto por `coupon.policy.spec.ts` (regra dedicada) e um teste de integração em
`rbac.e2e-spec.ts` que redime de ponta a ponta um cupom do Organizador A contra um cruzeiro do
Organizador B e confirma o 409.

### Artista (dado de referência compartilhado) editável por qualquer organizador (Médio)
`ArtistsController` restringia `POST`/`PATCH` a `@Roles(ORGANIZER_ADMIN)` sem checagem de posse
nenhuma — como um Artist não pertence a nenhum organizador específico (a mesma banda pode tocar
em cruzeiros de organizadores diferentes), isso permitia a Organizador A renomear/alterar o
artista que está na programação de Organizador B. `Ports` já tratava exatamente este caso
(dado de referência global → `PLATFORM_ADMIN`-only); `Artists` recebeu o mesmo tratamento.
Dois testes de integração passavam `orgAuth` para criar artistas (sem nenhuma relação com o
teste em si) — migrados para `prisma.artist.create` direto. Novo teste de regressão em
`rbac.e2e-spec.ts` confirma 403 para organizador e 201 para platform admin.

### JWT/cookie de sessão gravados em texto puro em todo log de produção (Crítico)
`app.module.ts` configurava `redact: ['req.body.password', ...]` para o `nestjs-pino` — mas o
serializer padrão do `pino-http` nunca inclui `req.body` (então a lista inteira era um no-op),
e *inclui* `req.headers` por padrão, sem nenhum redact cobrindo `authorization` (o Bearer JWT) ou
`cookie` (o refresh token httpOnly). Todo request autenticado gravava o token de sessão do
usuário por completo no log estruturado. Corrigido: `redact` passou a cobrir
`req.headers.authorization`, `req.headers.cookie` e `res.headers["set-cookie"]`.

### Segredos JWT sem piso de força (Alto)
`JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` só exigiam `min(1)` — um segredo de 1 caractere era
aceito. `env.schema.ts` agora exige 32+ caracteres para os dois, e um `.refine` extra garante
que são *diferentes* entre si (reusar o mesmo segredo pros dois tokens deixaria um access token
vazado utilizável pra forjar refresh tokens). Também adicionado: em produção, `DATABASE_URL`
precisa declarar `sslmode` (não bloqueia dev/test, onde o Postgres local não tem TLS). `.env`,
`.env.example` e os segredos usados em CI foram todos atualizados para 32+ caracteres.

### Sem rate limiting em nenhum endpoint (Alto)
Nenhum throttling existia — login, registro, forgot-password e refresh eram brute-forceable/
scrapeable sem limite. Adicionado `@nestjs/throttler`: um piso global (100 req/min por IP, via
`APP_GUARD`, checado **antes** dos guards de auth/role) mais limites bem mais apertados nas
rotas sensíveis (`login`: 10/min, `register`/`register/organizer`/`forgot-password`: 5/min,
`refresh`: 20/min). `check-in/lookup` e `check-in/confirm` também ganharam um limite — mas
generoso (120/min), porque embarque de verdade envolve o staff escaneando *muitos* tickets por
minuto de propósito; o limite ali existe só para conter brute-force do código do ticket (que já é
aleatório/seguro), não para restringir o uso legítimo da tela. `skipIf: NODE_ENV === 'test'`
desliga tudo durante os testes automatizados — sem isso, uma única suíte de integração que
registra vários organizadores/passageiros (comum neste codebase) estouraria o limite de
`/auth/register` só por exercitar a aplicação, não por abuso de verdade.

### Sem headers de segurança (Alto)
Nenhum `helmet` ou hardening manual de header existia. Adicionado `app.use(helmet())` em
`main.ts` — CSP, `X-Content-Type-Options`, `X-Frame-Options`, etc., com os defaults do helmet
(razoáveis para uma API JSON pura, sem HTML servido por ela).

### Swagger exposto incondicionalmente (Médio)
`/docs` (mapa completo de rotas/DTOs, inclusive o schema de auth) ficava disponível em qualquer
ambiente, inclusive uma hipotética produção — facilitando reconhecimento por quem tentasse
abusar da API. Agora só monta em `NODE_ENV !== 'production'`.

### SQL injection, XSS, CSRF — verificados, sem correção necessária
- **SQL injection**: toda query `$queryRaw` usa tagged template ou `Prisma.sql`/`Prisma.join`
  (parametrizado) — nenhuma concatenação de string. Amostrado em `bookings.repository.ts`,
  `activities.repository.ts`, `tickets.repository.ts`.
- **XSS**: nenhum `dangerouslySetInnerHTML` no frontend — todo texto passa pelo escape
  automático do React.
- **CSRF**: não é um risco vivo. O único fluxo autenticado por cookie é
  `POST /auth/refresh`/`logout` (`SameSite=Lax`, `httpOnly`, escopado a `/auth`) — `Lax` bloqueia
  o cookie em POST cross-site forjado (só top-level GET carrega). Toda outra rota autenticada usa
  Bearer token no header `Authorization`, que uma página CSRF não consegue forjar. Nenhuma rota
  de mutação aceita GET.

## Backend

### Filtro global de exceções sem contexto de correlação (Alto)
`AllExceptionsFilter` logava só `exception.stack`, sem method/path/id da request — correlacionar
um 500 de produção com a request que o causou exigia casar por horário manualmente. Agora inclui
`${method} ${url} (reqId=...)` (o `req.id` do próprio `pino-http`) antes do stack.

### Sem rede de segurança no nível do processo (Alto)
`main.ts` não tratava `unhandledRejection`/`uncaughtException` — um erro fora do pipeline de
request do Nest podia derrubar o processo sem log nenhum, ou pior, deixá-lo vivo num estado
indefinido. Agora ambos logam e encerram (`process.exit(1)`) de propósito — um estado corrompido
não detectado é mais perigoso que um restart (o orquestrador reinicia o processo).

### Emissão de ticket sem retry/visibilidade de falha (Alto)
`TICKET_ISSUANCE_QUEUE` usava os defaults do BullMQ (1 tentativa, sem backoff) e nenhum
processor (`TicketIssuanceProcessor`, `CabinHoldExpirationProcessor`) tinha
`@OnWorkerEvent('failed')`. Um blip de Redis/Postgres exatamente no momento da emissão
significava uma reserva **paga** sem ticket, para sempre, descoberta só vasculhando log manual.
Corrigido: as duas filas ganharam `attempts: 5` + backoff exponencial (`BookingsModule`);
`TicketIssuanceProcessor` grava um `AuditLog` (`ticket.issuance_failed`) quando a última
tentativa esgota; `CabinHoldExpirationProcessor` ganhou o mesmo log de falha (sem auditoria —
esse job já é auto-corrigível pelo próximo hold-attempt, ver ADR-0009, então só a visibilidade
importa).

### Cancelamento de cruzeiro pelo admin não cascateava (Alto)
`AdminCatalogService.cancelCruise` só mudava `Cruise.status` — passageiros ficavam com reservas
`CONFIRMED` e tickets `ISSUED` para uma viagem que a plataforma acabou de cancelar, sem
notificação nenhuma. Corrigido: agora, na MESMA transação, toda reserva ainda não-terminal
(`HELD`/`PAYMENT_PENDING`/`CONFIRMED`) do cruzeiro vira `CANCELLED` e todo ticket `ISSUED`
correspondente vira `CANCELLED` (via `updateMany` em lote, não um loop por reserva — evita N+1
num cruzeiro com dezenas de reservas); depois do commit, um `BOOKING_CANCELLED` é emitido por
reserva afetada, disparando o e-mail de cancelamento real para cada passageiro (ver ADR-0019).
Testado de ponta a ponta em `admin.e2e-spec.ts`: reserva confirmada + ticket emitido → cancela o
cruzeiro → confirma reserva/ticket `CANCELLED` e a notificação `BOOKING_CANCELLED` chegando.

### Verificado e considerado sólido, sem correção necessária
- Concorrência de hold de cabine, checkout/pagamento, capacidade de evento/dining, uso de cupom:
  todos usam `SELECT ... FOR UPDATE` + transação (ADR-0009/0012/0014) — sem lost-update.
- Paginação: todo endpoint de listagem usa `toPageResult`/`toSkipTake` com `pageSize` limitado
  (máx. 100 via Zod).
- Idempotência do checkout (`Idempotency-Key`) e do envio de notificação (ver ADR-0019) — sólidas.

## Frontend

### Nenhum fluxo de reserva existia (Crítico)
O maior achado da auditoria de frontend: não havia NENHUM caminho, em lugar nenhum do site, para
um visitante efetivamente reservar uma cabine. O botão "Consultar" de cada categoria em
`CruiseCabins` era um `<span>` sem `href`/`onClick` — um elemento puramente decorativo disfarçado
de botão. O mapa do navio (`ShipMap`/`MapDetailPanel`) já tinha o botão "Selecionar cabine"
totalmente construído (desabilitado quando a cabine não está `AVAILABLE`), mas o prop
`onSelectCabin` que ele espera nunca era fornecido por ninguém — o comentário no código já
avisava: *"So fornecido pelo fluxo de checkout (ainda nao implementado) — ver ADR-0008"*. E
`bookings.service.ts` só tinha `getMyBookings`; nenhuma função pra hold/detalhes/checkout. A
API (`POST cruises/:slug/cabins/:id/hold`, `PUT bookings/:id/details`,
`POST bookings/:id/checkout`) já existia, testada e funcionando — só não tinha nenhuma UI ligada
a ela.

Corrigido: novo `apps/web/src/features/booking/` com dois componentes —
`CabinBookingFlow` (ponte client-side entre `ShipMap` e o fluxo real: sem sessão, manda pro
`/login?redirect=...`; com sessão, abre o modal) e `BookingModal` (máquina de estados
hold → hóspedes → pagamento → confirmação/recusa/erro, reaproveitando os componentes
`Modal`/`ErrorState`/`Skeleton` já existentes). `bookings.service.ts` ganhou `holdCabin`,
`updateBookingDetails`, `checkoutBooking` e `releaseHold`, e sua duplicata privada de
`authFetchJson` foi consolidada na versão compartilhada de `api-client.ts`. Fechar o modal antes
do pagamento libera o hold na hora (`releaseHold`, best-effort) em vez de deixar o usuário esperar
a expiração pra tentar de novo. O botão "Consultar" de `CruiseCabins` virou um link real
(`<a href="#mapa-do-navio">`) até o mapa, onde a seleção de cabine específica de fato acontece —
uma categoria de preço não tem uma cabine física associada, então "consultar" leva até onde a
cabine de verdade é escolhida, não finge reservar direto do resumo de categoria. `/login` ganhou
suporte a `?redirect=` (só aceita caminho interno — nunca uma URL absoluta/protocol-relative, o
clássico open redirect) pra devolver o usuário à página do cruzeiro depois do login. Verificado
de ponta a ponta num browser real via Playwright (ver `booking-flow.spec.ts` abaixo) — login,
seleção de cabine, hóspedes, pagamento PIX (aprovação síncrona), confirmação e a navegação até
"Minha viagem" (`/reservas`, já existente e já rica — trip timeline, tickets, atividades — só
faltava algo que a alimentasse com uma reserva `CONFIRMED` de verdade).

### Sessão expirava permanentemente após 15 minutos (Alto)
O access token dura 15 minutos; o frontend só tentava renovar uma vez, no mount do
`AuthProvider`. Qualquer sessão ativa por mais de 15 minutos passava a receber 401 genérico em
toda chamada autenticada, sem logout nem redirecionamento — só um erro confuso, indefinidamente,
até um reload manual. Corrigido: `refreshSession` agora roda proativamente a cada 10 minutos
(`setInterval`, com folga sobre os 15min de expiração) enquanto houver um usuário logado, mais um
listener de `visibilitychange` (navegadores pausam/atrasam timers de abas em segundo plano — sem
isto, uma aba minimizada por mais de 15min voltaria com o token já expirado mesmo com o timer
armado). Uma renovação que falha de verdade (refresh token expirado/revogado) agora limpa o
estado local, permitindo que `RequireRole` redirecione pro `/login` normalmente.

### Botão "Tentar novamente" de erro não fazia nada (Alto)
`ErrorState` chamava `router.refresh()`, que só re-executa a busca de dados de Server
Components — um no-op silencioso em qualquer Client Component com fetch próprio (a maioria das
telas que usam `ErrorState`, inclusive todo o painel admin). Corrigido: `onRetry` opcional, com
fallback pra um reload de verdade (`window.location.reload()`) quando não fornecido. Fiado
explicitamente a `reload()` (refetch real, sem reload de página) nas 5 páginas admin que já
expunham essa função (`usuarios`, `organizadores`, `cruzeiros`, `reservas`, `cupons`); as outras 9
seguem com o fallback de reload de página, que já funciona corretamente — não é regressão, só uma
melhoria não estendida a todas as telas por tempo.

### Verificado e considerado sólido, sem correção necessária
- Todas as 14 páginas admin e 9 do organizador corretamente protegidas por `RequireRole` com o
  papel certo; nenhuma escalação de privilégio possível navegando direto pra uma URL.
- As 17 telas com tabela usam `overflow-x-auto`; toda imagem tem `alt`; `lang="pt-BR"` setado;
  nenhum submit duplo possível (botões desabilitam durante o envio).

### Adiado por tempo (não corrigido nesta revisão)
Achados Médio/Baixo, registrados para uma próxima rodada: `Modal` sem foco preso/semântica de
dialog completa; a maior parte do app autenticado não tem `<h1>` (`SectionHeading` sempre usa
`<h2>`); redirecionamento por papel incompatível não explica o motivo; formulário de login usa só
validação nativa do browser (`noValidate` sem substituto em JS); dropdowns do formulário de criar
cruzeiro sem estado de loading; `/registro` é uma rota órfã (sem link nenhum apontando pra ela);
9 páginas admin ainda sem `onRetry` explícito (ver acima).

## Testes

Cobertura nova/reforçada nesta revisão:
- `coupon.policy.spec.ts`: regra de organizador (3 casos).
- `rbac.e2e-spec.ts`: acesso indevido a Artist entre organizadores; cupom cross-organizador
  redimido de ponta a ponta.
- `admin.e2e-spec.ts`: cascade de cancelamento de cruzeiro (reserva + ticket + notificação).
- `env.schema.spec.ts`: piso de 32 caracteres, segredos iguais rejeitados, `sslmode` exigido em
  produção.
- `notifications.processor.spec.ts` (já existente, ver ADR-0019) segue cobrindo idempotência e
  dead-letter — não duplicado aqui.
- `booking-flow.spec.ts` (E2E, Playwright, novo): fluxo completo de reserva num browser real —
  registro, login, seleção de cabine no mapa, hóspedes, pagamento PIX, confirmação e chegada em
  "Minha viagem"; segundo caso cobre um cupom inválido durante o preenchimento (erro inline, sem
  quebrar a tela). Os dois casos rodam em série de propósito — em paralelo escolheriam
  deterministicamente a mesma primeira cabine disponível do primeiro deck e um dos dois receberia
  um 409 de concorrência legítimo (ver ADR-0009), não um bug do fluxo.

Suíte completa depois desta revisão: 263 testes unitários + 138 de integração (API), 30 unitários
(web) e 10 E2E (Playwright) — todos verdes; `typecheck`/`lint` limpos nos dois apps.

## DevOps

- `infra/docker/api.Dockerfile` e `web.Dockerfile`: ambos ganharam `USER node` no estágio de
  runtime (rodavam como root) e `--chown=node:node` nos `COPY --from=build`.
- `infra/docker-compose.yml`: serviço `mailhog` adicionado (faltava desde ADR-0019 — só existia
  em `docker-compose.test.yml`), portas configuráveis via `.env.example`.
- **CI (`e2e-tests`)**: o job buildava e subia o `web`, mas nunca a `api` — o comentário do
  workflow admitia isso ("os testes e2e atuais não dependem dela") e os specs existentes
  toleravam a API fora do ar com um `.or(errorState)`. Reescrito: agora sobe toda a infra
  (postgres/redis/minio/mailhog), roda `db:migrate` + `db:seed`, builda, inicia a API em
  background (`node apps/api/dist/main.js`), espera `/health` responder, só então roda o
  Playwright — os specs novos de fluxo crítico (ver abaixo) passam a exercitar a API de verdade
  em CI, não só tolerar a ausência dela.
- `apps/web/tests/e2e/ship-map.spec.ts` apontava para o slug do cruzeiro de demonstração ANTES
  de ele ser renomeado nesta mesma sessão de trabalho (`rock-in-sea-classicos-do-rock` →
  `heavy-metal-do-leo-sensations`) — corrigido; o teste estava silenciosamente sempre pulando
  (`test.skip`) desde a renomeação.
