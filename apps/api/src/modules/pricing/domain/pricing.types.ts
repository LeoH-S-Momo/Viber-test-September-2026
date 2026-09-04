import { CouponDiscountType, Prisma } from '@prisma/client';

/**
 * Tipos compartilhados do motor de precos (ver
 * docs/architecture/decisions/0011-pricing-engine.md). Nenhum tipo aqui
 * depende de Prisma Client "vivo" (query engine) — so do namespace
 * `Prisma.Decimal`, que e apenas a classe de matematica decimal exata
 * (decimal.js por baixo), reexportada pelo client gerado. Por isso este
 * modulo inteiro roda em testes unitarios sem banco nenhum no ar.
 */

export interface PricingBreakdown {
  subtotalAmount: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  feeAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
}

/** So os campos que CouponPolicy.computeDiscount precisa — nao a validade inteira do cupom. */
export interface CouponDiscountShape {
  discountType: CouponDiscountType;
  discountValue: Prisma.Decimal;
}

/**
 * Forma "achatada" (persistence -> domain) de um cupom para validacao —
 * `applicableCruiseIds: []` significa "valido para qualquer cruzeiro do
 * organizador/plataforma" (nao "invalido para todos"), o equivalente ao
 * antigo `cruiseId: null`.
 */
export interface CouponRecord extends CouponDiscountShape {
  id: string;
  code: string;
  /** null = cupom global (qualquer organizador) — nao-null restringe a reservas de cruzeiros DESTE organizador (ver CouponPolicy.validate, regra de hardening ADR-0020). */
  organizerId: string | null;
  minPurchaseAmount: Prisma.Decimal | null;
  maxUses: number | null;
  usedCount: number;
  maxUsesPerUser: number | null;
  validFrom: Date;
  validUntil: Date;
  isActive: boolean;
  applicableCruiseIds: string[];
}

export interface CouponValidationContext {
  cruiseId: string;
  /** Organizador DONO do cruzeiro sendo reservado — confrontado contra `CouponRecord.organizerId` (ver ADR-0020: sem isto, um cupom de um organizador era redimivel em cruzeiros de QUALQUER outro). */
  cruiseOrganizerId: string;
  /** subtotal (cabine + adicionais, antes de desconto/taxa) — base do valor minimo de compra. */
  subtotalAmount: Prisma.Decimal;
  /** Quantas vezes ESTE usuario ja usou este cupom (reservas ja confirmadas em algum momento, mesmo que depois canceladas) — ver BookingsRepository.countUserCouponUsage. */
  userUsageCount: number;
  now: Date;
}
