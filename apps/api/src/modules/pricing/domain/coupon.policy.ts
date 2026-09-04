import { ConflictException, NotFoundException } from '@nestjs/common';
import { CouponDiscountType, Prisma } from '@prisma/client';
import type { CouponDiscountShape, CouponRecord, CouponValidationContext } from './pricing.types';

/**
 * Regras de elegibilidade de um cupom (ver
 * docs/architecture/decisions/0011-pricing-engine.md) — logica pura, sem
 * Prisma Client/NestJS DI injetados. Sete regras nomeadas, nesta ordem fixa
 * (a primeira que falhar e a que o usuario ve — a ordem em si e parte do
 * contrato, testada em coupon.policy.spec.ts):
 *
 *   1. cupom inexistente     -> assertFound (NotFoundException, 404)
 *   2. cupom desativado      -> validate: isActive
 *   3. cupom expirado        -> validate: janela validFrom..validUntil
 *   4. cupom incompativel    -> validate: cruzeiro fora de applicableCruiseIds
 *   5. valor minimo          -> validate: subtotal < minPurchaseAmount
 *   6. limite atingido       -> validate: usedCount >= maxUses (global)
 *   7. cupom ja utilizado    -> validate: userUsageCount >= maxUsesPerUser (por usuario)
 *
 * Se nenhuma regra falhar, o cupom e valido — computeDiscount calcula o
 * desconto bruto (o clamp final contra o subtotal e a arredondamento para 2
 * casas sao responsabilidade do PricingEngine, nao daqui — ver pricing-engine.ts).
 */
export class CouponPolicy {
  /** Regra 1 — cupom inexistente. Separada de `validate` porque so faz sentido logo apos a busca por codigo. */
  static assertFound(coupon: CouponRecord | null): CouponRecord {
    if (!coupon) {
      throw new NotFoundException('Cupom nao encontrado.');
    }
    return coupon;
  }

  static validate(coupon: CouponRecord, context: CouponValidationContext): void {
    if (!coupon.isActive) {
      throw new ConflictException('Este cupom nao esta mais ativo.');
    }

    if (context.now.getTime() < coupon.validFrom.getTime() || context.now.getTime() > coupon.validUntil.getTime()) {
      throw new ConflictException('Este cupom esta expirado ou ainda nao comecou a valer.');
    }

    // Falsy (null/undefined) = cupom global (qualquer organizador) — truthy so vale pra
    // cruzeiros DO organizador dono do cupom. Sem esta regra, um cupom criado por/para o
    // Organizador A era redimivel em QUALQUER cruzeiro de QUALQUER organizador (ver ADR-0020) —
    // a mesma mensagem generica de "cupom nao e valido para este cruzeiro" da regra de
    // applicableCruiseIds logo abaixo, de proposito: nao revela ao cliente SE o cupom existe pra
    // outro organizador. Checa truthy (nao `!== null`) de proposito: um chamador/mock que so
    // omite `organizerId` (undefined) deve se comportar como "global", nao como "restrito a
    // undefined".
    if (coupon.organizerId && coupon.organizerId !== context.cruiseOrganizerId) {
      throw new ConflictException('Este cupom nao e valido para este cruzeiro.');
    }

    // Lista vazia = valido para qualquer cruzeiro (ver CouponRecord.applicableCruiseIds).
    if (coupon.applicableCruiseIds.length > 0 && !coupon.applicableCruiseIds.includes(context.cruiseId)) {
      throw new ConflictException('Este cupom nao e valido para este cruzeiro.');
    }

    if (coupon.minPurchaseAmount !== null && context.subtotalAmount.lessThan(coupon.minPurchaseAmount)) {
      throw new ConflictException(
        `Este cupom exige um valor minimo de ${coupon.minPurchaseAmount.toFixed(2)} para ser aplicado.`,
      );
    }

    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
      throw new ConflictException('Este cupom ja atingiu o limite de usos.');
    }

    if (coupon.maxUsesPerUser !== null && context.userUsageCount >= coupon.maxUsesPerUser) {
      throw new ConflictException('Voce ja utilizou este cupom o numero maximo de vezes permitido.');
    }
  }

  /**
   * Desconto BRUTO (sem clamp/arredondamento — ver PricingEngine.calculate).
   * So chamar depois de `validate` — aqui e so a conta, sem checar elegibilidade de novo.
   */
  static computeDiscount(coupon: CouponDiscountShape | null, subtotalAmount: Prisma.Decimal): Prisma.Decimal {
    if (!coupon) {
      return new Prisma.Decimal(0);
    }
    if (coupon.discountType === CouponDiscountType.PERCENTAGE) {
      return subtotalAmount.mul(coupon.discountValue).div(100);
    }
    return coupon.discountValue;
  }
}
