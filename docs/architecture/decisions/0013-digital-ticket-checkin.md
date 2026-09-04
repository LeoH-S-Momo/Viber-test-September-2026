# ADR-0013: Ingresso digital e check-in

## Status
Aceito

## Contexto
O ticket digital já existia parcialmente desde a modelagem original (`Ticket`/`CheckIn` no schema)
e ganhou emissão automática assíncrona em ADR-0012 (`TicketIssuanceProcessor`, disparado ao
confirmar uma reserva). O que faltava era o essencial pedido nesta etapa: um código realmente
seguro exposto como QR Code, o ticket disponível no frontend do passageiro, e — o núcleo do
pedido — um módulo de check-in para o Staff que valide de verdade (nunca confiando no cliente) e
garanta uso único mesmo sob concorrência real.

## "Gere um ticket" / "associe-o ao passageiro" — já resolvido, mantido
`TicketsService.issueTicketsForBooking` (ADR-0012) continua sendo o único emissor: um `Ticket` por
`BookingGuest`, upsert idempotente. Nada mudou aqui além de mover para a camada `application/` (ver
seção de arquitetura).

## "Gere um identificador seguro" — `generateSecureTicketCode`
`apps/api/src/modules/tickets/domain/secure-code.ts`: `TICKET-<uuid v4>`, gerado com
`crypto.randomUUID()` — o mesmo gerador criptograficamente seguro já usado para
`Payment.simulatedTransactionId` e chaves de idempotência (ADR-0012). ~122 bits de entropia
aleatória: não é sequencial, não codifica o id interno do ticket/hóspede, e não pode ser adivinhado
ou enumerado. Extraído para uma função própria (não inline) para deixar "isto é o requisito de
segurança" explícito e testável isoladamente.

## "Gere QR Code" — gerado no backend, sob demanda, nunca persistido
Adicionada a biblioteca `qrcode` (pura JS, sem binding nativo) à API. `TicketsService.findMine`
gera `qrCodeDataUrl` (um PNG em base64) a partir do `qrCode` de cada ticket, no momento da consulta
— nunca armazenado no banco. Decisão deliberada: o QR Code é uma *representação* determinística do
código já seguro, recalculável a qualquer momento sem custo (é matemática pura, não I/O); persistir
um blob de imagem por ticket infla o banco sem necessidade, e frequência de leitura (poucas
consultas por passageiro) não justifica cache. O frontend só precisa de um `<img src={dataUrl}>`,
sem nenhuma biblioteca de QR no cliente.

## "Disponibilize o ticket no frontend" — a base de autenticação que faltava
Antes desta etapa o frontend (`apps/web`) não tinha NENHUM fluxo de autenticação (as pastas
`(auth)/login`, `(passenger)/*`, `(organizer)/*` eram só `.gitkeep`) — só Server Components lendo
catálogo público. Para exibir um ticket (dado privado, exige login) e operar check-in (exige papel
de Staff), foi necessário construir a base client-side:

- `AuthProvider` (Context React) guarda o access token só em memória — nunca em `localStorage` —
  porque a refresh (cookie httpOnly, ver ADR-0005) já foi desenhada especificamente para não expor
  o token de longa duração a XSS; guardar o access token em storage persistente anularia esse
  design. Ao montar, tenta uma renovação silenciosa (`POST /auth/refresh`, cookie enviado
  automaticamente via `credentials: 'include'`) para restaurar a sessão entre recarregamentos de
  página sem pedir login de novo.
- Rotas protegidas fazem a checagem client-side (`RequireRole`), redirecionando para `/login` — o
  Next.js middleware não tem acesso ao cookie httpOnly sem uma chamada de rede, então a checagem de
  papel acontece depois da hidratação, não antes (aceitável: o dado nunca é servido antes da
  checagem, só a casca da página).

Este é o único jeito honesto de "disponibilizar no frontend" um dado que exige login — sem essa
base, a tela de ingressos seria decorativa.

## Módulo de check-in — arquitetura em camadas
`modules/tickets` foi promovido da estrutura plana original (um `service.ts`/`controller.ts`) para
o mesmo padrão em camadas de `bookings`/`catalog` (ADR-0006): `domain/` (puro), `persistence/`
(Prisma + lock), `application/` (orquestração), `presentation/` (dois controllers). Justificativa
para a mudança agora (não antes): o módulo cresceu de "listar + uma mutação simples" para uma
máquina de estados com concorrência real a proteger — o mesmo limiar de complexidade que já havia
justificado camadas em `bookings`/`catalog`.

### Os quatro estados (`CheckInPolicy`)
`NOT_CHECKED_IN | CHECKED_IN | INVALID | ALREADY_USED` — não são um enum de banco (não são um
estado *armazenado*, são o resultado *derivado* de combinar `Ticket.status` com
`Booking.status` no momento da consulta):

```
candidato == null                              -> INVALID  (codigo nao encontrado)
Booking.status != CONFIRMED                     -> INVALID  (reserva nao confirmada)
Ticket.status == CANCELLED                      -> INVALID  (reserva foi cancelada DEPOIS de emitir o ticket)
Ticket.status == CHECKED_IN                      -> ALREADY_USED
Ticket.status == ISSUED (e o resto acima passou) -> NOT_CHECKED_IN
```

Ordem de checagem fixa e testada (`check-in.policy.spec.ts`) — reserva-não-confirmada tem
precedência sobre ticket-já-usado quando (hipoteticamente) ambos seriam verdade, porque é a
explicação mais útil para o Staff ver.

### Fluxo em duas etapas: `lookup` (consulta) + `confirm` (mutação)
`POST /check-in/lookup` — sempre 200, nunca lança por "não encontrado"/"inválido"/"já usado": esses
são resultados esperados de uma busca, não erros. Mostra o ticket (passageiro, cruzeiro, cabine,
código, status) e o `outcome` ANTES de qualquer mutação — o Staff vê o que vai acontecer antes de
confirmar. `POST /check-in/confirm` — a mutação de verdade, sempre revalida do zero (nunca confia
no resultado de um `lookup` anterior — tempo passou entre as duas chamadas) e usa erros HTTP reais:
404 (não existe), 409 com mensagem distinta por motivo (já usado / reserva não confirmada / ticket
cancelado), 403 (ticket de outro organizador).

### "Não permita que um ticket seja usado duas vezes" — `SELECT ... FOR UPDATE`
`confirmCheckIn` trava a linha do `Ticket` pelo código (`lockByCodeForUpdate`, mesmo princípio de
ADR-0009/0010/0012) antes de revalidar e escrever — uma segunda tentativa concorrente do MESMO
ticket bloqueia até a primeira commitar, então vê o estado já `CHECKED_IN` e é rejeitada
(`ALREADY_USED`). A tabela `CheckIn` continua sem constraint de unicidade por ticket, de propósito
(comentário original no schema: reembarque após parada em porto, fora de escopo aqui) — a regra de
uso único desta etapa é imposta na camada de aplicação, sobre `Ticket.status`, não no banco.
Provado com 10 requisições **verdadeiramente concorrentes** (`Promise.all`, sem `await` entre os
disparos — mesmo padrão de todo teste de concorrência deste projeto) em
`check-in.e2e-spec.ts`: exatamente uma recebe `200 CHECKED_IN`, as outras nove `409 ALREADY_USED`,
e o banco mostra um único `CheckIn` no fim.

### "Verificar se a reserva está confirmada" — nos dois sentidos
Não é só uma checagem na hora do check-in: uma reserva `CONFIRMED` que é cancelada **depois** de já
ter emitido tickets (`BookingsService.cancelBooking`, permitido a partir de `CONFIRMED`) agora
também cancela os tickets ainda `ISSUED` dessa reserva (`TicketsService.cancelTicketsForBooking`,
chamado na MESMA transação do cancelamento) — sem isso, o ticket continuaria `ISSUED` e passaria no
check-in mesmo com a reserva cancelada. `CheckInPolicy` ainda revalida `Booking.status` a cada
consulta como segunda camada de defesa (mesmo que a cascata acima tivesse um bug, o check-in não
confiaria cegamente em `Ticket.status` sozinho).

## Um bug de corrida real encontrado testando concorrência de verdade
Testando 6/10 requisições verdadeiramente concorrentes de **checkout** (não check-in) com a mesma
`Idempotency-Key` — reaproveitando o teste já existente de ADR-0012 — uma das seis recebia `409`
em vez de `200`. Causa: `checkout` (ADR-0012) faz DUAS transações com uma chamada de rede no meio;
é possível que uma tentativa concorrente complete o ciclo inteiro (hold → pagamento → gateway →
`CONFIRMED`) ANTES de uma tentativa irmã sequer conseguir travar a linha da reserva pela primeira
vez. Essa tentativa tardia via `Booking.status == CONFIRMED` e caía no branch de `HELD`
(`BookingLifecyclePolicy.assertCanCheckout`), que rejeita qualquer status que não seja `HELD` —
incluindo `CONFIRMED`, por engano. Corrigido tratando `CONFIRMED` como um caso idempotente explícito
logo no início do `checkout` (devolve o estado atual, nunca chama o gateway de novo) — documentado
aqui, e não só no código, porque é exatamente o tipo de bug que só concorrência de verdade revela,
e é uma dívida que a suíte anterior (sem essa combinação específica de N concorrentes) não tinha
pego.

## Interface de check-in dedicada no frontend
`apps/web/src/app/(organizer)/organizador/check-in/page.tsx` — tela específica de operação (não uma
aba genérica de "ingressos"): campo de código (**"informar código"** — a leitura por câmera/scanner
foi deliberadamente deixada de fora desta etapa, ver Consequências), botão "Buscar" chamando
`lookup`, cartão de resultado colorido por `outcome` (verde/`NOT_CHECKED_IN`, âmbar/`ALREADY_USED`,
vermelho/`INVALID`) mostrando passageiro/cruzeiro/cabine, e um botão "Confirmar check-in" que só
aparece quando `outcome === 'NOT_CHECKED_IN'` — chama `confirm`. Toda decisão (os quatro estados,
se pode confirmar) vem do backend; o frontend só exibe o que a API já decidiu, nunca decide
sozinho — "a validação deve ocorrer no backend" na prática significa isto: o componente não tem
NENHUMA lógica de elegibilidade própria.

## Testes
- **Unitários**: `check-in.policy.spec.ts` (as quatro saídas, as bordas, a ordem de precedência)
  e `tickets.service.spec.ts` (orquestração com repositório mockado — lookup/confirm/ownership/
  emissão/QR Code/cancelamento em cascata).
- **Integração** (`check-in.e2e-spec.ts`, Postgres/Redis reais): emissão automática com código no
  formato esperado e QR Code válido; fluxo completo lookup→confirm→já-usado; código inexistente;
  reserva cancelada invalida o ticket já emitido; isolamento entre organizadores (403, sem revelar
  dados do ticket); Staff-only (passageiro recebe 403); autenticação obrigatória (401); e a garantia
  de uso único sob 10 tentativas verdadeiramente concorrentes.

## Consequências
- Leitura de QR Code por câmera (scanner de verdade) não foi implementada — "escanear/informar
  código" no pedido aceita as duas formas; a entrada manual do código é a que foi construída,
  testável e verificável de ponta a ponta sem depender de hardware/permissões de câmera do
  navegador. Um scanner por câmera é uma extensão natural (biblioteca client-side lendo o
  `<video>` e preenchendo o mesmo campo de código) que não muda nada no backend.
- Reembarque após parada em porto (múltiplos check-ins legítimos por ticket) continua fora de
  escopo, como já documentado no schema original — a tabela `CheckIn` já está pronta para isso
  (sem constraint de unicidade), só a regra de negócio de permitir não foi implementada.
