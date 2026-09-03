import { Prisma } from '@prisma/client';
import type { PricingBreakdown } from './pricing.types';

export interface PricingEngineInput {
  /** Preco da cabine (categoria x cruzeiro) — ver CruiseCabinPricing. */
  cabinPrice: Prisma.Decimal;
  /** Numero de passageiros (hospedes) da reserva — usado no PORT_FEE_PER_PASSENGER, nunca negativo na conta. */
  passengerCount: number;
  /** Adicionais/experiencias selecionados — ja resolvidos para preco (0 se incluso na tarifa). */
  addonPrices: Prisma.Decimal[];
  /**
   * Desconto BRUTO do cupom (ver CouponPolicy.computeDiscount), ou zero se
   * nao ha cupom. O engine e quem garante que o desconto nunca deixa o total
   * negativo (clamp) e quem arredonda — nao e responsabilidade do chamador.
   */
  discountAmount: Prisma.Decimal;
}

/**
 * Motor de calculo de preco de uma reserva (ver
 * docs/architecture/decisions/0011-pricing-engine.md) — logica pura e
 * deterministica: mesma entrada sempre produz a mesma saida, sem I/O, sem
 * estado, sem excecoes (validacao de cupom e responsabilidade de
 * `CouponPolicy`, chamada ANTES deste calculo). Composto por dominio
 * proprio (`modules/pricing`) em vez de morar dentro de `bookings` porque a
 * mesma conta serve qualquer fluxo que precise de preco de reserva, nao so
 * o de Booking.
 *
 * Quatro numeros, sempre nesta ordem de dependencia:
 *   subtotalAmount = preco da cabine + soma dos adicionais ("adicionais"/"experiencias" sao o
 *                    mesmo conceito neste schema — BookingExperience/Experience — nao ha uma
 *                    segunda entidade "adicional" distinta de Experience)
 *   discountAmount = desconto do cupom, arredondado e limitado a [0, subtotalAmount]
 *   feeAmount      = taxa de servico da plataforma (SERVICE_FEE_RATE, sobre subtotal-desconto)
 *                    + taxa fixa de embarque por passageiro (PORT_FEE_PER_PASSENGER x passengerCount)
 *   totalAmount    = subtotal - desconto + taxa
 */
export class PricingEngine {
  /**
   * Taxa de servico percentual da plataforma — regra fixa e documentada (nao
   * ha integracao com gateway real ainda, entao nao existe uma tabela de
   * taxas por metodo de pagamento — ver ADR-0009/ADR-0010).
   */
  static readonly SERVICE_FEE_RATE = new Prisma.Decimal('0.05');

  /**
   * Taxa fixa de embarque/porto, cobrada por passageiro — e o que faz
   * "numero de passageiros" entrar de fato no preco final, sem redefinir
   * `CruiseCabinPricing.price` (que continua sendo o preco flat da cabine,
   * ja testado e migrado desde ADR-0010) como "preco por pessoa". Ver
   * secao "Numero de passageiros" do ADR-0011 para o racional completo.
   */
  static readonly PORT_FEE_PER_PASSENGER = new Prisma.Decimal('50');

  /** Todo valor monetario do breakdown final tem exatamente 2 casas — nunca fracao de centavo. */
  private static readonly DECIMAL_PLACES = 2;

  private static round(value: Prisma.Decimal): Prisma.Decimal {
    return value.toDecimalPlaces(this.DECIMAL_PLACES, Prisma.Decimal.ROUND_HALF_UP);
  }

  static calculate(input: PricingEngineInput): PricingBreakdown {
    const addonsTotal = input.addonPrices.reduce((sum, price) => sum.add(price), new Prisma.Decimal(0));
    const subtotalAmount = this.round(input.cabinPrice.add(addonsTotal));

    // Clamp defensivo: o desconto nunca ultrapassa o subtotal (reserva nunca
    // fica negativa) nem fica negativo (cupom mal-configurado nao vira acrescimo).
    const clampedDiscount = Prisma.Decimal.min(Prisma.Decimal.max(input.discountAmount, 0), subtotalAmount);
    const discountAmount = this.round(clampedDiscount);

    const taxableAmount = subtotalAmount.sub(discountAmount);

    const passengerCount = Math.max(0, Math.trunc(input.passengerCount));
    const portFee = this.PORT_FEE_PER_PASSENGER.mul(passengerCount);
    const feeAmount = this.round(taxableAmount.mul(this.SERVICE_FEE_RATE).add(portFee));

    const totalAmount = this.round(taxableAmount.add(feeAmount));

    return { subtotalAmount, discountAmount, feeAmount, totalAmount };
  }
}
