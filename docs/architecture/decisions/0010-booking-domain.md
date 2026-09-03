# ADR-0010: Domínio de Booking (reserva, hóspedes, adicionais, checkout simulado)

## Status
Aceito

## Contexto
O motor de hold (ADR-0009) resolvia a parte de infraestrutura — travar uma cabine com segurança
contra concorrência — mas uma `Booking` só tinha `userId`/`cruiseId`/`cabinId`/preço da cabine.
Faltava o domínio de negócio completo: hóspedes, adicionais (Experience), desconto (cupom), taxa,
e o fluxo real que o pedido descreve — **cruzeiro → cabine → hóspedes → adicionais → reserva →
checkout** — terminando numa confirmação de pagamento simulada (sem gateway real).

## Terminologia: por que `HELD` não foi renomeado de novo para `PENDING`
O pedido lista, como exemplo, os estados `PENDING`, `PAYMENT_PENDING`, `CONFIRMED`, `CANCELLED`,
`EXPIRED`. `HELD` (ADR-0009) já significa exatamente o que o pedido chama de `PENDING` — "a
reserva existe, a cabine está travada, ainda não virou checkout". Renomear de novo seria puro
churn de nome sem ganho técnico, e a instrução original desta conversa pede para explicar antes de
alterar uma decisão anterior que não está tecnicamente errada — este é o caso: `HELD` continua
correto, só ganhou vizinhos novos. `BookingStatus` agora é:

```
HELD --(updateDetails)*--> HELD                 (hóspedes/adicionais, repetível)
HELD --(checkout)--------> PAYMENT_PENDING        (pagamento simulado criado)
PAYMENT_PENDING --(confirmPayment)--> CONFIRMED    ("BOOKED")
HELD | PAYMENT_PENDING --(hold expira)--> EXPIRED  (sempre o sistema)
HELD | PAYMENT_PENDING | CONFIRMED --(cancelBooking)--> CANCELLED (sempre o usuário)
HELD --(releaseHold)-----> CANCELLED               (abandonar antes do checkout)
```
`EXPIRED` passou a ser um valor de enum de verdade (antes, um hold expirado virava `CANCELLED`
com um motivo em texto) — agora o desfecho "o sistema fechou por timeout" é distinguível de "o
usuário cancelou" também pela *coluna* `status`, não só pelo texto livre de
`cancellationReason`. `COMPLETED`/`REFUNDED` continuam reservados pro futuro (viagem realizada /
reembolso pós-pagamento).

## "Preço, descontos, taxas, total" — quatro colunas, não duas
`Booking` antes só tinha `totalAmount` (na prática guardando o preço da cabine) e
`discountAmount` (nunca usado). Agora:

- `subtotalAmount` — cabine + adicionais selecionados, antes de desconto/taxa ("preço").
- `discountAmount` — cupom aplicado, sempre calculado (0 quando não há cupom) ("descontos").
- `feeAmount` — taxa de serviço da plataforma, `BookingPricingPolicy.FEE_RATE` (5%, fixo e
  documentado — não existe gateway real com tabela de taxas por método ainda) ("taxas").
- `totalAmount` — `subtotal - desconto + taxa`, o valor de fato cobrado ("total").

Todas calculadas por uma única função pura (`BookingPricingPolicy.computeBreakdown`), chamada nos
dois únicos lugares que escrevem preço (`holdCabin` e `updateDetails`) — nunca calculada duas
vezes de formas diferentes. O seed (dados de demonstração) também usa essa mesma função para gerar
a reserva confirmada de exemplo, em vez de números digitados à mão — a prova de que o dado de
demonstração bate com a regra real, não uma coincidência.

## "Passageiro responsável" vs. "hóspede titular"
`Booking.userId` (quem tem a conta, fez a reserva) é distinto de `BookingGuest.isPrimary` (quem de
fato embarca como titular da cabine) — o schema já modelava os dois papéis separadamente antes
desta etapa; `BookingGuestsPolicy` agora aplica a regra de verdade: exatamente um hóspede marcado
`isPrimary`, lista nunca maior que `CabinCategory.maxOccupancy`. A mesma pessoa normalmente é as
duas coisas, mas nada força isso — o titular da conta pode reservar para terceiros sem embarcar.

## "Seleciona adicionais" — nova tabela `BookingExperience`
`Experience` (tour, degustação — ADR anterior do catálogo) não tinha nenhuma relação com
`Booking`. Nova tabela de junção `BookingExperience(bookingId, experienceId, priceAtBooking)`,
com `priceAtBooking` congelando o preço no momento da seleção — se o organizador mudar o preço da
Experience depois, reservas já feitas não mudam de valor retroativamente. `PUT
/bookings/:id/details` substitui a lista inteira a cada chamada (semântica idempotente de PUT: os
mesmos dados enviados de novo produzem o mesmo resultado, não duplicam), junto com os hóspedes —
os dois sempre mudam juntos porque ambos disparam o mesmo recálculo de preço.

## Checkout simulado usa o `Payment` que já existia no schema
`Payment.simulatedTransactionId` já existia desde a modelagem original do domínio, comentado como
"equivalente ao ID do gateway real" — sinal de que o plano sempre foi simular, não integrar de
verdade (ver `docs/product/BACKLOG.md`). `POST /bookings/:id/checkout` (`HELD -> PAYMENT_PENDING`)
cria uma linha `Payment` (`PENDING`, com `simulatedTransactionId` gerado) — é o "checkout" do
pedido: escolher método de pagamento, sem processar nada de verdade. `POST
/bookings/:id/confirm-payment` faz o papel do callback do gateway (que não existe): aprova o
`Payment` e confirma a `Booking`. Ainda **nenhum gateway real é chamado** — exatamente como
pedido.

## Idempotência — onde fez sentido, e por quê
Três mecanismos, cada um resolvendo um risco diferente:

1. **`Idempotency-Key` na criação do hold** (`POST /cruises/:slug/cabins/:cabinId/hold`) — o caso
   clássico de idempotência em REST (mesmo padrão do Stripe): o cliente gera uma chave por
   tentativa de reserva; reenviar a mesma chave (por timeout de rede, retry automático do
   navegador) devolve a reserva já criada em vez de tentar criar outra ou falhar com 409. Testado
   com uma corrida **de verdade** (`Promise.all`, duas requisições simultâneas com a mesma chave)
   em `booking-domain.e2e-spec.ts` — as duas resolvem pro mesmo id, e só uma linha existe no
   banco. Funciona porque o lock da cabine (ADR-0009) já serializa as duas tentativas: a segunda,
   ao ver a reserva que a primeira acabou de criar, reconhece que é a mesma chave/usuário e
   devolve o resultado em vez de lançar conflito.
2. **`checkout` idempotente por estado** — reenviar o checkout com o **mesmo** método de pagamento
   enquanto ainda está `PAYMENT_PENDING` devolve o estado atual em vez de abrir um segundo
   `Payment`. Reenviar com um método **diferente** nesse meio-tempo é um erro de uso genuíno (409)
   — o cliente deveria cancelar e começar de novo, não trocar de método no meio do fluxo.
3. **`confirmPayment` idempotente por estado** — um callback de gateway retentado (comportamento
   real e comum de gateways de pagamento) que já foi processado antes não falha, só devolve a
   reserva já `CONFIRMED`. Sem isto, um retry do "gateway" simulado poderia tentar aprovar o mesmo
   `Payment` duas vezes.

Nenhum dos três precisou de uma tabela de "chaves de idempotência processadas" separada — cada um
se apoia no estado que já existe (o `idempotencyKey` na própria `Booking`, ou o `status` da
`Booking`/`Payment`), consistente com "não implementar uma solução artificial" (ADR-0009).

## Testes
- **Unitários** (`booking-lifecycle.policy.spec.ts`, `booking-pricing.policy.spec.ts`,
  `booking-guests.policy.spec.ts`): cada policy pura testada isolada — matemática de preço/cupom,
  transições de estado, capacidade/titular de hóspedes.
- **`bookings.service.spec.ts`**: orquestração com repositório mockado — o "orchestration layer"
  chama as policies certas, na ordem certa, e reage certo a Redis fora do ar.
- **Integração** (`booking-domain.e2e-spec.ts`, Postgres/Redis reais): fluxo completo ponta a
  ponta com valores de preço conferidos a mão; cabine indisponível (manutenção e já reservada)
  nunca vira reserva; capacidade/titular/cupom/adicional de outro cruzeiro rejeitados pela pilha
  inteira (não só pela função pura); posse entre usuários reais (404, não 403); e os dois cenários
  de idempotência (retry sequencial e corrida real) descritos acima.

## Consequências
- `POST /bookings` propriamente dito não existe como endpoint único — "criar a reserva" é o
  próprio hold (`POST .../hold`); "preencher a reserva" é `PUT .../details`. Documentado aqui para
  não parecer uma omissão: os dois passos juntos são o que o pedido chama de "cria reserva".
- Gateway de pagamento real, emissão de ingresso digital e notificações continuam fora de escopo —
  o `Payment` simulado e o `BookingGuest` já existem prontos para quando essas etapas vierem.
- `CabinAvailabilityPolicy` (ADR-0008) e a busca de reservas ativas em `catalog/persistence/
  cabins.repository.ts` e no dashboard do organizador (`organizers.service.ts`) foram atualizadas
  para tratar `PAYMENT_PENDING` como bloqueante também — sem isso, uma cabine em checkout
  apareceria como livre no mapa do navio.
