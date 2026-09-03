# ADR-0011: Motor de preços (PricingEngine + CouponPolicy)

## Status
Aceito

## Contexto
O domínio de Booking (ADR-0010) já calculava preço, mas a lógica vivia dentro de
`BookingPricingPolicy`, misturada com validação de cupom, e o cupom em si (`Coupon`) só suportava
código, percentual/fixo, validade e limite global — sem valor mínimo, sem limite por usuário, e
escopado a **um único** cruzeiro (`cruiseId` singular). O pedido desta etapa pede explicitamente um
domínio/serviço dedicado ao cálculo (nada de regra complexa em controller), cupons com sete
atributos adicionais, sete regras nomeadas, cálculo determinístico/testável e cuidado explícito com
precisão monetária — o suficiente para justificar promover isso a um domínio próprio em vez de só
esticar a policy existente.

## Por que um módulo `pricing` separado de `bookings`
`PricingEngine` e `CouponPolicy` (em `apps/api/src/modules/pricing/domain/`) não têm nenhuma
dependência de `Booking` — recebem preço da cabine, contagem de passageiros, preços de adicionais e
um desconto já calculado, e devolvem quatro números. `BookingsService` é o único consumidor hoje,
mas a conta em si (preço + taxa + desconto) não é conceitualmente parte do domínio de reserva, é uma
capacidade reutilizável — daí morar em `modules/pricing`, não em `modules/bookings/domain`. Nenhuma
das duas classes é um provider do NestJS (sem `@Injectable()`): são funções puras expostas como
métodos estáticos, o mesmo padrão já usado por `BookingLifecyclePolicy`/`BookingGuestsPolicy` — não
precisam de DI porque não têm estado nem dependem do Prisma Client "vivo" (só do namespace
`Prisma.Decimal`, que é matemática decimal pura). Isso também é o que torna o cálculo 100%
testável sem banco: `pricing-engine.spec.ts` e `coupon.policy.spec.ts` rodam inteiramente em memória.

`BookingPricingPolicy` foi **removida** (não deprecated, removida) — toda sua responsabilidade foi
absorvida por `PricingEngine`/`CouponPolicy`, sem lógica duplicada em paralelo.

## O que o preço final considera, e como
Quatro números, sempre nesta ordem de dependência (`PricingEngine.calculate`):

```
subtotalAmount = preco da cabine (CruiseCabinPricing) + soma dos adicionais selecionados
discountAmount = desconto do cupom, arredondado e limitado a [0, subtotalAmount]
feeAmount      = SERVICE_FEE_RATE (5%) sobre (subtotal - desconto)
                 + PORT_FEE_PER_PASSENGER (R$50) x numero de passageiros
totalAmount    = subtotal - desconto + taxa
```

- **Preço da cabine**: `CruiseCabinPricing.price` — inalterado desde ADR-0010, continua sendo o
  preço flat da cabine (categoria x cruzeiro), não "por pessoa".
- **Número de passageiros**: em vez de reinterpretar `CruiseCabinPricing.price` como "preço por
  pessoa" (o que exigiria remodelar uma coluna já testada e migrada, e mudaria o significado de
  `subtotalAmount` sem necessidade), o número de passageiros entra pela **taxa de embarque por
  passageiro** (`PricingEngine.PORT_FEE_PER_PASSENGER`, R$50 fixo) — um conceito real e comum em
  cruzeiros de verdade (taxa de porto/embarque cobrada por pessoa, distinta da diária da cabine),
  aditivo e reversível: se no futuro o preço por pessoa for necessário, essa taxa pode ser removida
  sem tocar em `CruiseCabinPricing`. Em `holdCabin` (ainda sem hóspedes informados) o número de
  passageiros é 0 — a taxa de embarque só aparece depois que `updateDetails` informa quem viaja.
- **Taxas**: taxa de serviço percentual (5%, `SERVICE_FEE_RATE` — regra fixa e documentada, ver
  ADR-0009/0010: não há gateway real com tabela de taxas por método ainda) + a taxa de embarque
  acima, somadas num único `feeAmount`.
- **Adicionais / experiências**: mesmo conceito no schema (`Experience`/`BookingExperience`, ver
  ADR-0010) — o pedido lista os dois separadamente, mas este código não modela uma segunda entidade
  "adicional" distinta de `Experience`; documentado aqui para não parecer uma omissão.
- **Descontos / cupons**: o cupom é o único mecanismo de desconto hoje — `CouponPolicy.
  computeDiscount` calcula o valor bruto, `PricingEngine.calculate` faz o clamp final e o
  arredondamento (ver seção de precisão abaixo).

## Precisão monetária
Todo o cálculo usa `Prisma.Decimal` (decimal.js) de ponta a ponta — nunca `number` do JavaScript,
que sofre do clássico `0.1 + 0.2 !== 0.3` (testado explicitamente em `pricing-engine.spec.ts` como
prova, não só assumido). Além disso, `PricingEngine.calculate` arredonda `subtotalAmount`,
`discountAmount`, `feeAmount` e `totalAmount` para exatamente 2 casas decimais
(`ROUND_HALF_UP`, a convenção padrão para dinheiro) **no momento em que cada um é produzido**, antes
de ser usado no próximo passo da conta — não deixa o Postgres arredondar cada coluna
`Decimal(10,2)` de forma independente na escrita. Isso garante uma propriedade que antes não era
garantida: `subtotal - desconto + taxa == total` **exatamente**, sem fração de centavo escondida,
testado com casos que produziriam 3+ casas decimais se não arredondados (ex.: desconto percentual
sobre `333.33` gera `49.9995` bruto, que vira `50.00`, não `49.99` truncado nem `49.9995` cru).
Também há clamps defensivos (desconto nunca negativo, nunca maior que o subtotal; contagem de
passageiros nunca negativa) para o motor nunca produzir um total inválido mesmo com entrada
inconsistente.

## Cupom: os sete atributos pedidos
```
código             -> Coupon.code (unique)
percentual ou fixo -> Coupon.discountType (PERCENTAGE | FIXED_AMOUNT) + discountValue
validade           -> Coupon.validFrom / validUntil
limite de uso       -> Coupon.maxUses / usedCount (global)
valor mínimo        -> Coupon.minPurchaseAmount (novo)
cruzeiros aplicaveis -> CouponCruise (novo, many-to-many — ver abaixo)
limite por usuario  -> Coupon.maxUsesPerUser (novo) + contagem de uso por usuario
```

### Por que "cruzeiros aplicáveis" virou uma tabela, não uma segunda coluna
`Coupon.cruiseId` (singular, opcional) só permitia "vale para um cruzeiro" ou "vale para todos". O
pedido pede explicitamente **cruzeiros** (plural) — um cupom pode valer para vários cruzeiros
específicos sem valer para todos os outros do organizador. Nova tabela `CouponCruise(couponId,
cruiseId)` (mesmo padrão de `BookingExperience`, ADR-0010): nenhuma linha = vale para qualquer
cruzeiro (equivalente ao antigo `cruiseId: null`); 1+ linhas = só vale para os cruzeiros listados.
Migration `20260903190000_pricing_engine_coupons` faz o backfill (cupons com `cruiseId` antigo
viram uma linha na tabela nova) antes de derrubar a coluna — nenhum cupom existente muda de
comportamento.

### Por que "já utilizado" sobrevive a um cancelamento
`BookingsRepository.countUserCouponUsage` conta reservas cujo `confirmedAt` não é nulo — **não**
reservas com `status` atualmente `CONFIRMED`. `confirmedAt` é setado uma vez em `confirmPayment` e
nunca limpo (nem por `cancelBooking`), então uma reserva confirmada e depois cancelada continua
contando como "usada" pelo usuário. Decisão deliberada: um cupom de "primeira compra"
(`maxUsesPerUser: 1`) que pudesse ser resetado só cancelando e refazendo a reserva não seria um
limite de verdade. O limite **global** (`usedCount`) já seguia esse mesmo princípio desde ADR-0010
(incrementado em `confirmPayment`, nunca decrementado por cancelamento) — este ADR só estende o
mesmo raciocínio para o limite por usuário.

## As sete regras, nesta ordem fixa (`CouponPolicy`)
A ordem é parte do contrato (testada em `coupon.policy.spec.ts`, seção "ordem de precedência") — a
primeira regra que falhar é a que o usuário vê, mesmo que várias falhassem ao mesmo tempo:

1. **cupom inexistente** — `CouponPolicy.assertFound` (404, antes de qualquer outra checagem —
   não faz sentido validar um cupom que não existe).
2. **cupom desativado** — `isActive`.
3. **cupom expirado** — fora da janela `validFrom..validUntil` (o pedido só nomeia "expirado";
   "ainda não começou a valer" — antes de `validFrom` — está no mesmo bucket, mesma mensagem,
   documentado aqui em vez de virar uma oitava regra não pedida).
4. **cupom incompatível** — cruzeiro fora de `applicableCruiseIds` (lista vazia = compatível com
   qualquer cruzeiro).
5. **valor mínimo não atingido** — `subtotalAmount < minPurchaseAmount` (base: subtotal, "preço"
   antes de desconto/taxa — o mesmo `subtotalAmount` de ADR-0010).
6. **limite atingido** — `usedCount >= maxUses` (global, todos os usuários somados).
7. **cupom já utilizado** — `userUsageCount >= maxUsesPerUser` (por usuário — ver seção acima).

Se nenhuma falhar: **cupom válido**, `computeDiscount` calcula o desconto bruto e `PricingEngine.
calculate` faz o resto. Todas as sete regras (e os limites/bordas de cada uma — igual ao limite,
uma unidade abaixo do limite, `null` = sem limite) têm teste unitário dedicado; o fluxo completo
(hold → hóspedes/adicionais/cupom → checkout → confirmação) e cada uma das sete rejeições também
são exercitados contra Postgres real em `booking-domain.e2e-spec.ts`, não só na policy pura.

## Consequências
- Nenhuma API de gestão de cupom (CRUD para organizador criar/editar cupons) foi criada — fora do
  pedido desta etapa, que é sobre o motor de cálculo e as regras, não sobre uma tela de
  administração. O cupom de demonstração (`ROCKINSEA10`) continua criado só pelo seed, agora com
  `minPurchaseAmount`, `maxUsesPerUser` e a nova tabela de cruzeiros aplicáveis preenchidos.
- `BookingsService.holdCabin`/`updateDetails` foram atualizados para chamar `PricingEngine`/
  `CouponPolicy` em vez da antiga `BookingPricingPolicy` — o comportamento de preço sem cupom e sem
  hóspedes ainda informados (no momento do hold) não muda; o que muda é que, a partir do primeiro
  `PUT .../details` com hóspedes, `feeAmount`/`totalAmount` passam a incluir a taxa de embarque por
  passageiro (testes de integração de etapas anteriores que verificavam o preço só no momento do
  hold — antes de haver hóspedes — não foram afetados; o único teste que verificava o preço **após**
  informar hóspedes foi atualizado com os novos valores esperados).
