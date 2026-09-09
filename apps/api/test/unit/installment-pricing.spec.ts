import { Prisma } from '@prisma/client';
import { InstallmentPricing } from '../../src/modules/payments/domain/installment-pricing';

describe('InstallmentPricing', () => {
  const amount = new Prisma.Decimal(1000);

  describe('1x — a vista', () => {
    it('nao cobra juros: installmentAmount === amount, totalAmount === amount', () => {
      const option = InstallmentPricing.calculate(amount, 1);
      expect(option.interestRate).toBe(0);
      expect(option.installmentAmount.toFixed(2)).toBe('1000.00');
      expect(option.totalAmount.toFixed(2)).toBe('1000.00');
    });
  });

  describe('2x-6x — faixa de 1,99% a.m.', () => {
    it.each([2, 6])('usa a taxa de 1,99%% para %ix e cobra juros (total > amount)', (installments) => {
      const option = InstallmentPricing.calculate(amount, installments);
      expect(option.interestRate).toBe(0.0199);
      expect(option.totalAmount.greaterThan(amount)).toBe(true);
    });
  });

  describe('7x-12x — faixa de 2,49% a.m.', () => {
    it.each([7, 12])('usa a taxa de 2,49%% para %ix e cobra mais juros que a faixa anterior', (installments) => {
      const option = InstallmentPricing.calculate(amount, installments);
      expect(option.interestRate).toBe(0.0249);
    });

    it('12x tem juros totais maiores que 7x (mais parcelas, mesma taxa mensal)', () => {
      const seven = InstallmentPricing.calculate(amount, 7);
      const twelve = InstallmentPricing.calculate(amount, 12);
      expect(twelve.totalAmount.greaterThan(seven.totalAmount)).toBe(true);
    });
  });

  it('totalAmount e sempre installmentAmount * installments (parcelas iguais, Tabela Price)', () => {
    for (const n of [1, 2, 5, 10, 12]) {
      const option = InstallmentPricing.calculate(amount, n);
      expect(option.totalAmount.toFixed(2)).toBe(option.installmentAmount.mul(n).toFixed(2));
    }
  });

  describe('options', () => {
    it('devolve as 12 opcoes, da 1x a 12x, em ordem', () => {
      const options = InstallmentPricing.options(amount);
      expect(options).toHaveLength(12);
      expect(options.map((o) => o.installments)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    });
  });
});
