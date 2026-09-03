# ADR-0012: Checkout completo via `PaymentGateway` (abstração + `FakePaymentGateway`)

## Status
Aceito

## Contexto
O checkout simulado de ADR-0010 só criava um `Payment` sempre `PENDING` e um `confirmPayment` que
sempre aprovava incondicionalmente — nunca havia uma decisão de verdade (aprovar/recusar), nem uma
abstração de gateway: a lógica "simulada" estava espalhada direto em `BookingsService`. Este pedido
pede explicitamente uma porta (`PaymentGateway`) desacoplada de provedor, uma implementação fake
que de fato decide o desfecho, estados de pagamento tratados (aprovado/recusado/pendente/timeout/
duplicata/retry), idempotência de verdade, preço nunca confiado do cliente, e um plano documentado
de como trocar por Stripe/Mercado Pago sem tocar no domínio de reservas.

## Arquitetura: porta e adaptador
`apps/api/src/modules/payments/`:
- `domain/payment-gateway.ts` — a **porta**: interface `PaymentGateway` (`charge`, `retrieve`),
  tipos `ChargeRequest`/`ChargeResult`, `PaymentGatewayTimeoutError`, e o token de DI
  `PAYMENT_GATEWAY` (um `Symbol`, já que é uma interface — TypeScript apaga interfaces em
  runtime, o NestJS precisa de um token para injetar por ele).
- `infrastructure/fake-payment-gateway.ts` — o **adaptador**: `FakePaymentGateway implements
  PaymentGateway`, decide determinísticamente sem chamar rede nenhuma.
- `payments.module.ts` — o único arquivo do projeto que sabe qual implementação está em uso:
  `{ provide: PAYMENT_GATEWAY, useClass: FakePaymentGateway }`.

`BookingsService` (e qualquer outro consumidor futuro) depende só de `PaymentGateway` — nenhum
import de `FakePaymentGateway` existe fora de `payments.module.ts`. Ver a seção final para o plano
de troca por um gateway real.

## O checkout, passo a passo (mapeado ao que foi pedido)
`BookingsService.checkout` (`POST /bookings/:id/checkout`):

1. **Receber a reserva** — `bookingId` + `paymentMethod`, dono verificado (404, não 403 — ADR-0005).
2. **Validar o hold** — `BookingLifecyclePolicy.assertCanCheckout` (status `HELD`, prazo não
   vencido) ou, se já `PAYMENT_PENDING`, a checagem de retry/duplicata (ver seção de idempotência).
3. **Recalcular o preço no servidor** + **validar cupom** — `recalculateCheckoutPricing` sempre
   busca de novo `CruiseCabinPricing` (preço atual da cabine), os `BookingExperience.priceAtBooking`
   já congelados (ADR-0010) e revalida o cupom já aplicado contra o estado *atual* (`CouponPolicy.
   validate`, ADR-0011) — nunca lê `Booking.subtotalAmount`/`totalAmount` como verdade, sempre
   reconstrói. Ver seção "backend como fonte de verdade" abaixo.
4. **Criar pagamento** — `Payment` `PENDING`, valor = o breakdown recém-calculado (não o que veio
   salvo).
5. **Simular aprovação ou recusa** — `paymentGateway.charge(...)`, **fora** de qualquer transação
   (ver próxima seção).
6. **Atualizar pagamento** — `updatePaymentOutcome` grava o desfecho real.
7. **Confirmar ou liberar a reserva** — `APPROVED` → `CONFIRMED`; `DECLINED` → `CANCELLED` (mesmo
   desfecho de `cancelBooking`, só que disparado pelo gateway, com o motivo da recusa).
8. **Confirmar a cabine quando aprovado** — nenhuma escrita extra: `CabinAvailabilityPolicy`
   (ADR-0008/0009) já deriva "BOOKED" a partir de existir uma `Booking` `CONFIRMED` para aquela
   cabine — a "confirmação da cabine" é automática por construção, documentada aqui para não
   parecer uma omissão.
9. **Emitir o ticket posteriormente** — só depois que a reserva vira `CONFIRMED`, um job BullMQ é
   enfileirado (delay 0, mas assíncrono — a resposta do checkout não espera por ele) para criar um
   `Ticket` por hóspede (ver seção própria abaixo).

## Por que duas transações, não uma
A criação do `Payment` (passo 4) e a aplicação do desfecho (passos 6-7) rodam em **transações
separadas**, com a chamada ao gateway (passo 5) acontecendo **entre elas, fora de qualquer
transação**. Um gateway de verdade é uma chamada de rede — segurar o lock `SELECT ... FOR UPDATE`
da linha da reserva (o mesmo mecanismo de ADR-0009) durante essa chamada bloquearia qualquer outra
operação nessa reserva pela duração inteira da chamada de rede, e se o gateway demorar (ou nunca
responder — timeout), o lock ficaria preso. Por isso `checkout` é: `transação A (prepara e cria o
Payment) → chamada de rede (fora de transação) → transação B (aplica o desfecho)`. `confirmPayment`
segue o mesmo princípio: `paymentGateway.retrieve` acontece fora de transação, só a aplicação do
resultado (`applyChargeOutcome`, reaproveitado dos dois fluxos) é que trava a linha.

## Estados de pagamento
`PaymentStatus` (enum já existente, sem mudança): `PENDING`, `APPROVED`, `DECLINED`, `REFUNDED`
(reservado para o futuro). Novo campo `Payment.failureReason` (nullable) guarda o motivo de uma
recusa — equivalente ao `decline_code`/`failure_message` de um gateway real.

| Caso pedido | Como é tratado |
|---|---|
| **pagamento aprovado** | `ChargeResult.outcome === 'APPROVED'` → `Payment` `APPROVED` + `paidAt`; `Booking` `CONFIRMED`. |
| **pagamento recusado** | `outcome === 'DECLINED'` → `Payment` `DECLINED` + `failureReason`; `Booking` `CANCELLED` (motivo inclui o da recusa). |
| **pagamento pendente** | `outcome === 'PENDING'` (ex.: `BOLETO`, assíncrono na vida real) → `Payment` continua `PENDING`; `Booking` continua `PAYMENT_PENDING`, resolvido depois por `confirmPayment` (o "webhook" simulado) ou pela expiração do hold (ADR-0009, já trata `PAYMENT_PENDING` como expirável). |
| **timeout** | `PaymentGatewayTimeoutError` — **não** é um `outcome`, é a ausência de resposta. `Payment` fica `PENDING` (já criado antes da chamada), `Booking` fica `PAYMENT_PENDING`. Nunca vira erro HTTP nem assume sucesso/falha — ver próxima seção. |
| **tentativa duplicada** | Reenviar o checkout com o mesmo método enquanto o pagamento ainda está `PENDING` reutiliza o **mesmo** `Payment`/`idempotencyKey` e chama o gateway de novo — o gateway (real ou fake) devolve o resultado já decidido, nunca cobra duas vezes (ver Idempotência). Testado com 6 requisições **verdadeiramente concorrentes** (`Promise.all`) na mesma chave — `checkout-payment-gateway.e2e-spec.ts`. |
| **retry** | Mesmo mecanismo acima: reenviar com a mesma chave após um timeout é como o cliente *deveria* reagir (nunca gerar uma chave nova sem saber se a primeira completou) — o gateway revela o resultado real na segunda tentativa. |
| **cupom incompatível/expirado/etc.** | Delegado a `CouponPolicy` (ADR-0011), revalidado no passo 3. |

## Idempotência
Header opcional `Idempotency-Key` em `POST /bookings/:id/checkout` (mesmo padrão já usado na
criação do hold — ADR-0010). Vira `ChargeRequest.idempotencyKey`; se omitido, o `Payment.id`
(estável por tentativa) é usado como padrão. `FakePaymentGateway` mantém um cache
`idempotencyKey -> ChargeResult`: a mesma chave **nunca** gera uma segunda decisão, sempre devolve
o resultado já tomado — é isso que torna seguro tanto reenviar por engano (clique duplo, retry
automático do navegador) quanto reenviar deliberadamente após um timeout. Um gateway real (Stripe,
Mercado Pago) implementa a mesma garantia do lado dele ao receber um `Idempotency-Key` repetido —
`FakePaymentGateway` só simula esse comportamento em memória.

Um segundo nível de idempotência já existia (ADR-0009/0010): o `SELECT ... FOR UPDATE` na linha da
reserva serializa tentativas concorrentes de checkout na mesma reserva, então mesmo sem nenhuma
`Idempotency-Key` explícita, duas requisições paralelas nunca criam dois `Payment` `PENDING`
simultâneos para a mesma reserva.

## "Backend como fonte de verdade" — o que isso significa na prática aqui
Não existe (e nunca existiu) um campo de preço vindo do corpo da requisição de checkout — só
`paymentMethod`. A ameaça real não é "o cliente manda o preço", é "o servidor confia demais no que
ele mesmo escreveu antes": `Booking.subtotalAmount`/`totalAmount` são gravados em `updateDetails`
e podem ficar desatualizados até o checkout (o organizador muda o preço da cabine, o cupom aplicado
expira ou esgota nesse meio-tempo). `recalculateCheckoutPricing` busca de novo as tabelas de origem
a cada checkout — testado em `checkout-payment-gateway.e2e-spec.ts` mudando o preço da cabine
*depois* de `updateDetails` e confirmando que o checkout cobra o valor novo, nunca o antigo.

## Uma corrida real encontrada e corrigida durante os testes
`confirmPayment` originalmente decidia "há um pagamento pendente?" lendo `snapshot.payments[0]`
vindo de `findByIdForUser` — uma consulta composta (`Booking` + `payments` incluídos) que não é
necessariamente uma única leitura atômica. Testado com 8 chamadas **verdadeiramente concorrentes**
a `confirm-payment` (mesmo padrão de `Promise.all` de ADR-0009), isso abria uma janela real: uma
leitura via `findByIdForUser` podia ver `Booking.status` ainda `PAYMENT_PENDING` mas, por ser uma
segunda sub-consulta, já ver `Payment.status` `APPROVED` (resolvido por uma tentativa concorrente
que colidiu bem no meio) — resultando num 409 "nenhum pagamento pendente" incorreto. Corrigido
buscando o pagamento mais recente com uma única consulta simples (`findLatestPayment`) e, quando
ele já não está mais `PENDING`, devolvendo o estado atual da reserva (sem erro) em vez de lançar
conflito — uma corrida perdida não é um uso inválido. Documentado aqui porque é exatamente o tipo
de bug que só aparece testando concorrência de verdade, não simulada.

## Emissão de ticket ("posteriormente")
`apps/api/src/jobs/ticket-issuance-queue.ts` + `ticket-issuance.processor.ts` — mesmo padrão de
fila/processor de ADR-0009 (`cabin-hold-expiration`). Enfileirado com delay 0 **depois** que a
transação que confirma a reserva já commitou (nunca dentro dela — um job agendado para uma
transação que ainda pode dar rollback seria um bug). `TicketsService.issueTicketsForBooking` cria
um `Ticket` por `BookingGuest` (`qrCode: TICKET-<uuid>`), idempotente via `upsert` (um retry do
BullMQ nunca duplica). Assíncrono de propósito: o cliente recebe a confirmação da reserva sem
esperar a emissão — testado com um polling curto em `checkout-payment-gateway.e2e-spec.ts` até o
worker processar o job de verdade (não simulado).

## Como trocar `FakePaymentGateway` por Stripe, Mercado Pago ou outro provedor
Nenhum código de `bookings` muda — só:

1. Criar `apps/api/src/modules/payments/infrastructure/stripe-payment-gateway.ts` implementando
   `PaymentGateway`:
   ```ts
   @Injectable()
   export class StripePaymentGateway implements PaymentGateway {
     private readonly stripe = new Stripe(this.config.getOrThrow('STRIPE_SECRET_KEY'));
     constructor(private readonly config: ConfigService) {}

     async charge(request: ChargeRequest): Promise<ChargeResult> {
       try {
         const intent = await this.stripe.paymentIntents.create(
           {
             amount: request.amount.mul(100).toNumber(), // Stripe trabalha em centavos
             currency: request.currency.toLowerCase(),
             payment_method_types: [mapMethod(request.method)],
             description: request.description,
           },
           { idempotencyKey: request.idempotencyKey }, // o mesmo conceito, nativo do SDK
         );
         return { outcome: mapStripeStatus(intent.status), gatewayTransactionId: intent.id };
       } catch (error) {
         if (isStripeTimeout(error)) throw new PaymentGatewayTimeoutError();
         throw error;
       }
     }

     async retrieve(gatewayTransactionId: string): Promise<ChargeResult> {
       const intent = await this.stripe.paymentIntents.retrieve(gatewayTransactionId);
       return { outcome: mapStripeStatus(intent.status), gatewayTransactionId: intent.id };
     }
   }
   ```
   (Mercado Pago seguiria o mesmo formato com o SDK `mercadopago`, mapeando `payment.status`
   `approved`/`rejected`/`pending` para `GatewayOutcome`.)
2. Adicionar `STRIPE_SECRET_KEY` (ou equivalente) a `env.schema.ts`/`.env.example`.
3. Trocar uma linha em `payments.module.ts`: `useClass: FakePaymentGateway` →
   `useClass: StripePaymentGateway`.

`BookingsService`, `BookingsRepository`, os controllers, os testes de `pricing`/`bookings` — nada
disso importa `FakePaymentGateway` nem `StripePaymentGateway` diretamente, só o token
`PAYMENT_GATEWAY`. O único ajuste ainda necessário fora de `payments/` seria trocar os sufixos
mágicos de teste (`::decline`/`::timeout`/`::pending`, exclusivos do fake) pelos números de
cartão/ferramentas de sandbox que cada gateway real oferece — os testes de integração que os usam
(`checkout-payment-gateway.e2e-spec.ts`) precisariam apontar para o sandbox do provedor escolhido
em vez do fake nesse cenário, mas a orquestração do domínio continuaria idêntica.

## Testes
- **Unitários** (`bookings.service.spec.ts`, ampliado): orquestração do checkout/confirmPayment com
  `PaymentGateway` mockado — aprovação, recusa, timeout (erro genuíno vs. `PaymentGatewayTimeoutError`
  tratado à parte), retry reaproveitando o mesmo `Payment`, recálculo de preço nunca confiando no
  valor já salvo.
- **Integração** (`checkout-payment-gateway.e2e-spec.ts`, novo, contra Postgres/Redis reais):
  aprovação síncrona (PIX) confirma dentro do próprio checkout e emite ticket depois; recusa libera
  a cabine; timeout deixa `PAYMENT_PENDING` e um retry com a mesma chave revela o resultado real sem
  cobrar duas vezes; 6 requisições **verdadeiramente concorrentes** com a mesma `Idempotency-Key`
  nunca criam um segundo `Payment`; preço recalculado no servidor após uma mudança de preço da
  cabine; posse entre usuários (404, não 403). `cabin-hold-concurrency.e2e-spec.ts` e
  `booking-domain.e2e-spec.ts` foram ajustados ao novo formato (PIX/cartão resolvem no próprio
  checkout; BOLETO é o caminho que genuinamente fica `PENDING`, usado para exercitar
  `confirm-payment`/a corrida documentada acima).

## Consequências
- `Payment.simulatedTransactionId` passa a ter um valor **provisório** (`PENDING-<uuid>`) no
  momento da criação, substituído pelo id real do gateway (`FAKE-<uuid>`) quando a resposta chega —
  documentado no schema; nenhuma migração de nulidade foi necessária (a coluna continua `NOT NULL`).
- Nenhuma tela/API de gestão de pagamentos (estorno, disputa) foi criada — fora do pedido desta
  etapa, que é sobre o fluxo de checkout em si.
- O endpoint `confirm-payment` continua existindo — não é redundante: ele é o papel do *webhook*
  (uma notificação assíncrona de que um pagamento inicialmente `PENDING` se resolveu), distinto do
  `checkout`, que é a chamada *síncrona/de saída* ao gateway. Métodos sincronos (PIX, cartão) hoje
  resolvem inteiramente dentro do `checkout` — `confirm-payment` continua necessário para BOLETO
  (assíncrono por natureza) e para qualquer timeout que só se resolva depois.
