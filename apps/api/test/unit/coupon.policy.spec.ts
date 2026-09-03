import { ConflictException, NotFoundException } from '@nestjs/common';
import { CouponDiscountType, Prisma } from '@prisma/client';
import { CouponPolicy } from '../../src/modules/pricing/domain/coupon.policy';
import type { CouponRecord, CouponValidationContext } from '../../src/modules/pricing/domain/pricing.types';

const NOW = new Date('2026-06-01T12:00:00Z');

function coupon(overrides: Partial<CouponRecord> = {}): CouponRecord {
  return {
    id: 'coupon-1',
    code: 'TESTE10',
    discountType: CouponDiscountType.PERCENTAGE,
    discountValue: new Prisma.Decimal(10),
    minPurchaseAmount: null,
    maxUses: null,
    usedCount: 0,
    maxUsesPerUser: null,
    validFrom: new Date('2026-01-01T00:00:00Z'),
    validUntil: new Date('2026-12-31T23:59:59Z'),
    isActive: true,
    applicableCruiseIds: [],
    ...overrides,
  };
}

function context(overrides: Partial<CouponValidationContext> = {}): CouponValidationContext {
  return {
    cruiseId: 'cruise-1',
    subtotalAmount: new Prisma.Decimal(1000),
    userUsageCount: 0,
    now: NOW,
    ...overrides,
  };
}

describe('CouponPolicy', () => {
  describe('regra 1 — cupom inexistente (assertFound)', () => {
    it('rejeita com 404 quando o cupom e null (codigo nao encontrado)', () => {
      expect(() => CouponPolicy.assertFound(null)).toThrow(NotFoundException);
      expect(() => CouponPolicy.assertFound(null)).toThrow(/nao encontrado/);
    });

    it('devolve o proprio cupom quando encontrado', () => {
      const c = coupon();
      expect(CouponPolicy.assertFound(c)).toBe(c);
    });
  });

  describe('regra — cupom desativado', () => {
    it('rejeita um cupom com isActive false', () => {
      expect(() => CouponPolicy.validate(coupon({ isActive: false }), context())).toThrow(ConflictException);
      expect(() => CouponPolicy.validate(coupon({ isActive: false }), context())).toThrow(/nao esta mais ativo/);
    });
  });

  describe('regra 2 — cupom expirado (janela de validade)', () => {
    it('rejeita antes de validFrom', () => {
      const c = coupon({ validFrom: new Date('2026-07-01T00:00:00Z') });
      expect(() => CouponPolicy.validate(c, context())).toThrow(/expirado|ainda nao comecou/);
    });

    it('rejeita depois de validUntil', () => {
      const c = coupon({ validUntil: new Date('2026-05-01T00:00:00Z') });
      expect(() => CouponPolicy.validate(c, context())).toThrow(/expirado|ainda nao comecou/);
    });

    it('aceita exatamente no instante de validFrom (limite inclusivo)', () => {
      const c = coupon({ validFrom: NOW });
      expect(() => CouponPolicy.validate(c, context())).not.toThrow();
    });

    it('aceita exatamente no instante de validUntil (limite inclusivo)', () => {
      const c = coupon({ validUntil: NOW });
      expect(() => CouponPolicy.validate(c, context())).not.toThrow();
    });
  });

  describe('regra 3 — cupom incompativel (cruzeiros aplicaveis)', () => {
    it('aceita quando applicableCruiseIds esta vazio (valido para qualquer cruzeiro)', () => {
      const c = coupon({ applicableCruiseIds: [] });
      expect(() => CouponPolicy.validate(c, context({ cruiseId: 'qualquer-cruzeiro' }))).not.toThrow();
    });

    it('rejeita um cruzeiro fora da lista de cruzeiros aplicaveis', () => {
      const c = coupon({ applicableCruiseIds: ['cruise-a', 'cruise-b'] });
      expect(() => CouponPolicy.validate(c, context({ cruiseId: 'cruise-c' }))).toThrow(
        /nao e valido para este cruzeiro/,
      );
    });

    it('aceita um cruzeiro presente na lista de cruzeiros aplicaveis (varios cruzeiros por cupom)', () => {
      const c = coupon({ applicableCruiseIds: ['cruise-a', 'cruise-b'] });
      expect(() => CouponPolicy.validate(c, context({ cruiseId: 'cruise-b' }))).not.toThrow();
    });
  });

  describe('regra 4 — valor minimo nao atingido', () => {
    it('rejeita quando o subtotal fica abaixo do minimo exigido', () => {
      const c = coupon({ minPurchaseAmount: new Prisma.Decimal(500) });
      expect(() => CouponPolicy.validate(c, context({ subtotalAmount: new Prisma.Decimal(499.99) }))).toThrow(
        /valor minimo/,
      );
    });

    it('aceita quando o subtotal e exatamente igual ao minimo (limite inclusivo)', () => {
      const c = coupon({ minPurchaseAmount: new Prisma.Decimal(500) });
      expect(() => CouponPolicy.validate(c, context({ subtotalAmount: new Prisma.Decimal(500) }))).not.toThrow();
    });

    it('aceita qualquer subtotal quando nao ha minimo definido (null)', () => {
      const c = coupon({ minPurchaseAmount: null });
      expect(() => CouponPolicy.validate(c, context({ subtotalAmount: new Prisma.Decimal(0.01) }))).not.toThrow();
    });
  });

  describe('regra 5 — limite global atingido (maxUses)', () => {
    it('rejeita quando usedCount ja atingiu maxUses', () => {
      const c = coupon({ maxUses: 5, usedCount: 5 });
      expect(() => CouponPolicy.validate(c, context())).toThrow(/limite de usos/);
    });

    it('aceita um uso abaixo do limite', () => {
      const c = coupon({ maxUses: 5, usedCount: 4 });
      expect(() => CouponPolicy.validate(c, context())).not.toThrow();
    });

    it('aceita qualquer usedCount quando maxUses e null (sem limite global)', () => {
      const c = coupon({ maxUses: null, usedCount: 999_999 });
      expect(() => CouponPolicy.validate(c, context())).not.toThrow();
    });
  });

  describe('regra 6 — cupom ja utilizado (limite por usuario)', () => {
    it('rejeita quando o usuario ja atingiu maxUsesPerUser', () => {
      const c = coupon({ maxUsesPerUser: 1 });
      expect(() => CouponPolicy.validate(c, context({ userUsageCount: 1 }))).toThrow(/ja utilizou este cupom/);
    });

    it('aceita quando o usuario ainda nao atingiu o limite pessoal', () => {
      const c = coupon({ maxUsesPerUser: 3 });
      expect(() => CouponPolicy.validate(c, context({ userUsageCount: 2 }))).not.toThrow();
    });

    it('aceita qualquer userUsageCount quando maxUsesPerUser e null (sem limite por usuario)', () => {
      const c = coupon({ maxUsesPerUser: null });
      expect(() => CouponPolicy.validate(c, context({ userUsageCount: 999 }))).not.toThrow();
    });

    it('o limite global (maxUses) e o limite por usuario (maxUsesPerUser) sao independentes', () => {
      // Global com sobra, mas este usuario especifico ja esgotou a propria cota.
      const c = coupon({ maxUses: 1000, usedCount: 3, maxUsesPerUser: 2 });
      expect(() => CouponPolicy.validate(c, context({ userUsageCount: 2 }))).toThrow(/ja utilizou este cupom/);
    });
  });

  describe('regra 7 — cupom valido (nenhuma regra falha)', () => {
    it('nao lanca para um cupom ativo, na janela, compativel, acima do minimo e dentro dos limites', () => {
      const c = coupon({
        applicableCruiseIds: ['cruise-1'],
        minPurchaseAmount: new Prisma.Decimal(100),
        maxUses: 10,
        usedCount: 3,
        maxUsesPerUser: 2,
      });
      expect(() =>
        CouponPolicy.validate(c, context({ cruiseId: 'cruise-1', subtotalAmount: new Prisma.Decimal(1000), userUsageCount: 1 })),
      ).not.toThrow();
    });
  });

  describe('ordem de precedencia das regras (deterministica)', () => {
    it('reporta "desativado" antes de qualquer outra regra, mesmo se tambem expirado/esgotado', () => {
      const c = coupon({ isActive: false, validUntil: new Date('2020-01-01'), maxUses: 1, usedCount: 1 });
      expect(() => CouponPolicy.validate(c, context())).toThrow(/nao esta mais ativo/);
    });

    it('reporta "expirado" antes de "incompativel"/"limite", quando ambos tambem falhariam', () => {
      const c = coupon({
        validUntil: new Date('2020-01-01'),
        applicableCruiseIds: ['outro-cruzeiro'],
        maxUses: 1,
        usedCount: 1,
      });
      expect(() => CouponPolicy.validate(c, context())).toThrow(/expirado|ainda nao comecou/);
    });

    it('reporta "incompativel" antes de "valor minimo"/"limite", quando ambos tambem falhariam', () => {
      const c = coupon({
        applicableCruiseIds: ['outro-cruzeiro'],
        minPurchaseAmount: new Prisma.Decimal(999_999),
        maxUses: 1,
        usedCount: 1,
      });
      expect(() => CouponPolicy.validate(c, context())).toThrow(/nao e valido para este cruzeiro/);
    });

    it('reporta "limite global" antes de "ja utilizado", quando ambos tambem falhariam', () => {
      const c = coupon({ maxUses: 1, usedCount: 1, maxUsesPerUser: 1 });
      expect(() => CouponPolicy.validate(c, context({ userUsageCount: 1 }))).toThrow(/limite de usos/);
    });
  });

  describe('computeDiscount — matematica do desconto (bruta, sem clamp/arredondamento)', () => {
    it('e zero quando nao ha cupom', () => {
      expect(CouponPolicy.computeDiscount(null, new Prisma.Decimal(1000)).toNumber()).toBe(0);
    });

    it('calcula um desconto percentual sobre o subtotal', () => {
      const c = coupon({ discountType: CouponDiscountType.PERCENTAGE, discountValue: new Prisma.Decimal(20) });
      expect(CouponPolicy.computeDiscount(c, new Prisma.Decimal(1000)).toNumber()).toBe(200);
    });

    it('devolve o valor fixo diretamente para FIXED_AMOUNT', () => {
      const c = coupon({ discountType: CouponDiscountType.FIXED_AMOUNT, discountValue: new Prisma.Decimal(150) });
      expect(CouponPolicy.computeDiscount(c, new Prisma.Decimal(1000)).toNumber()).toBe(150);
    });

    it('NAO limita um FIXED_AMOUNT maior que o subtotal — isso e responsabilidade do PricingEngine, nao daqui', () => {
      const c = coupon({ discountType: CouponDiscountType.FIXED_AMOUNT, discountValue: new Prisma.Decimal(5000) });
      expect(CouponPolicy.computeDiscount(c, new Prisma.Decimal(1000)).toNumber()).toBe(5000);
    });
  });
});
