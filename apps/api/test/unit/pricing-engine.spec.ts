import { Prisma } from '@prisma/client';
import { PricingEngine } from '../../src/modules/pricing/domain/pricing-engine';

const ZERO = new Prisma.Decimal(0);
const dec = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);

describe('PricingEngine', () => {
  describe('calculate — cabine sozinha, sem adicionais/passageiros/desconto', () => {
    it('cobra so a taxa de servico (5%) quando nao ha passageiros informados ainda', () => {
      const breakdown = PricingEngine.calculate({
        cabinPrice: dec(2000),
        passengerCount: 0,
        addonPrices: [],
        discountAmount: ZERO,
      });

      expect(breakdown.subtotalAmount.toNumber()).toBe(2000);
      expect(breakdown.discountAmount.toNumber()).toBe(0);
      expect(breakdown.feeAmount.toNumber()).toBe(100); // 5% de 2000
      expect(breakdown.totalAmount.toNumber()).toBe(2100);
    });
  });

  describe('calculate — adicionais/experiencias somam ao subtotal', () => {
    it('soma o preco de cada adicional selecionado', () => {
      const breakdown = PricingEngine.calculate({
        cabinPrice: dec(2000),
        passengerCount: 0,
        addonPrices: [dec(150), dec(90)],
        discountAmount: ZERO,
      });

      expect(breakdown.subtotalAmount.toNumber()).toBe(2240);
      expect(breakdown.feeAmount.toNumber()).toBe(112); // 5% de 2240
      expect(breakdown.totalAmount.toNumber()).toBe(2352);
    });

    it('trata uma lista vazia de adicionais como zero, nao um erro', () => {
      const breakdown = PricingEngine.calculate({
        cabinPrice: dec(2000),
        passengerCount: 0,
        addonPrices: [],
        discountAmount: ZERO,
      });
      expect(breakdown.subtotalAmount.toNumber()).toBe(2000);
    });

    it('trata um adicional de preco zero (incluso na tarifa) sem alterar o subtotal', () => {
      const breakdown = PricingEngine.calculate({
        cabinPrice: dec(2000),
        passengerCount: 0,
        addonPrices: [dec(0)],
        discountAmount: ZERO,
      });
      expect(breakdown.subtotalAmount.toNumber()).toBe(2000);
    });
  });

  describe('calculate — numero de passageiros entra via taxa de embarque por pessoa', () => {
    it('cobra PORT_FEE_PER_PASSENGER (R$50) por passageiro, somado a taxa percentual', () => {
      const breakdown = PricingEngine.calculate({
        cabinPrice: dec(2000),
        passengerCount: 2,
        addonPrices: [],
        discountAmount: ZERO,
      });

      // 5% de 2000 (100) + 50 x 2 passageiros (100) = 200
      expect(breakdown.feeAmount.toNumber()).toBe(200);
      expect(breakdown.totalAmount.toNumber()).toBe(2200);
    });

    it('escala linearmente com o numero de passageiros', () => {
      const forOne = PricingEngine.calculate({ cabinPrice: dec(1000), passengerCount: 1, addonPrices: [], discountAmount: ZERO });
      const forFour = PricingEngine.calculate({ cabinPrice: dec(1000), passengerCount: 4, addonPrices: [], discountAmount: ZERO });

      const portFeeDelta = forFour.feeAmount.sub(forOne.feeAmount);
      expect(portFeeDelta.toNumber()).toBe(PricingEngine.PORT_FEE_PER_PASSENGER.toNumber() * 3);
    });

    it('nunca cobra taxa de embarque negativa para uma contagem de passageiros negativa (defensivo)', () => {
      const breakdown = PricingEngine.calculate({
        cabinPrice: dec(1000),
        passengerCount: -3,
        addonPrices: [],
        discountAmount: ZERO,
      });
      expect(breakdown.feeAmount.toNumber()).toBe(50); // so os 5% de 1000, sem taxa de embarque negativa
    });

    it('trunca um numero de passageiros fracionario (defensivo contra entrada invalida)', () => {
      const breakdown = PricingEngine.calculate({
        cabinPrice: dec(1000),
        passengerCount: 2.9,
        addonPrices: [],
        discountAmount: ZERO,
      });
      // trunc(2.9) = 2 passageiros, nao 2.9 nem 3
      expect(breakdown.feeAmount.toNumber()).toBe(50 + PricingEngine.PORT_FEE_PER_PASSENGER.toNumber() * 2);
    });
  });

  describe('calculate — desconto e aplicado antes da taxa (taxa incide sobre o valor pos-desconto)', () => {
    it('subtrai o desconto do subtotal antes de calcular a taxa percentual', () => {
      const breakdown = PricingEngine.calculate({
        cabinPrice: dec(2000),
        passengerCount: 0,
        addonPrices: [],
        discountAmount: dec(200),
      });

      const taxable = 2000 - 200;
      expect(breakdown.discountAmount.toNumber()).toBe(200);
      expect(breakdown.feeAmount.toNumber()).toBe(taxable * 0.05);
      expect(breakdown.totalAmount.toNumber()).toBe(taxable + taxable * 0.05);
    });

    it('clampa um desconto maior que o subtotal para nunca deixar o total negativo (defensivo)', () => {
      const breakdown = PricingEngine.calculate({
        cabinPrice: dec(1000),
        passengerCount: 0,
        addonPrices: [],
        discountAmount: dec(5000), // muito acima do subtotal
      });

      expect(breakdown.discountAmount.toNumber()).toBe(1000); // limitado ao subtotal
      expect(breakdown.totalAmount.toNumber()).toBeGreaterThanOrEqual(0);
    });

    it('clampa um desconto negativo (cupom mal-configurado) para zero em vez de virar acrescimo (defensivo)', () => {
      const breakdown = PricingEngine.calculate({
        cabinPrice: dec(1000),
        passengerCount: 0,
        addonPrices: [],
        discountAmount: dec(-50),
      });
      expect(breakdown.discountAmount.toNumber()).toBe(0);
    });
  });

  describe('calculate — precisao monetaria (evita fracao de centavo)', () => {
    it('arredonda um desconto percentual que produziria 3+ casas decimais', () => {
      // 333.33 * 15% = 49.9995 -> arredonda para 50.00 (ROUND_HALF_UP), nao trunca para 49.99
      const breakdown = PricingEngine.calculate({
        cabinPrice: dec('333.33'),
        passengerCount: 0,
        addonPrices: [],
        discountAmount: dec('333.33').mul(15).div(100), // 49.9995, sem arredondar ainda — o engine arredonda
      });
      expect(breakdown.discountAmount.toNumber()).toBe(50);
    });

    it('mantem a identidade subtotal - desconto + taxa = total exatamente, sem drift de centavos', () => {
      const cases: Array<{ cabinPrice: string; addons: string[]; discount: string; passengers: number }> = [
        { cabinPrice: '1999.99', addons: ['33.33', '17.17'], discount: '10.005', passengers: 3 },
        { cabinPrice: '2500.01', addons: [], discount: '0', passengers: 1 },
        { cabinPrice: '100.10', addons: ['0.01'], discount: '99.999', passengers: 0 },
      ];

      for (const c of cases) {
        const breakdown = PricingEngine.calculate({
          cabinPrice: dec(c.cabinPrice),
          passengerCount: c.passengers,
          addonPrices: c.addons.map(dec),
          discountAmount: dec(c.discount),
        });

        const identity = breakdown.subtotalAmount.sub(breakdown.discountAmount).add(breakdown.feeAmount);
        expect(identity.toNumber()).toBeCloseTo(breakdown.totalAmount.toNumber(), 10);
        expect(identity.toDecimalPlaces(2).toNumber()).toBe(breakdown.totalAmount.toNumber());

        // Todo valor do breakdown tem no maximo 2 casas decimais — nunca fracao de centavo.
        for (const value of [breakdown.subtotalAmount, breakdown.discountAmount, breakdown.feeAmount, breakdown.totalAmount]) {
          expect(value.decimalPlaces()).toBeLessThanOrEqual(2);
        }
      }
    });

    it('nunca sofre do erro classico de ponto flutuante (0.1 + 0.2 !== 0.3 em JS number)', () => {
      // Prova de que o motor usa Prisma.Decimal (decimal.js) de ponta a ponta, nao Number.
      expect(0.1 + 0.2).not.toBe(0.3); // o bug classico, para contraste
      const breakdown = PricingEngine.calculate({
        cabinPrice: dec('0.1'),
        passengerCount: 0,
        addonPrices: [dec('0.2')],
        discountAmount: ZERO,
      });
      expect(breakdown.subtotalAmount.toNumber()).toBe(0.3);
    });
  });

  describe('calculate — determinismo', () => {
    it('produz exatamente o mesmo resultado para a mesma entrada, chamado varias vezes', () => {
      const input = {
        cabinPrice: dec(1750.5),
        passengerCount: 3,
        addonPrices: [dec(99.9), dec(25)],
        discountAmount: dec(87.25),
      };

      const first = PricingEngine.calculate(input);
      const second = PricingEngine.calculate(input);

      expect(first.subtotalAmount.toNumber()).toBe(second.subtotalAmount.toNumber());
      expect(first.discountAmount.toNumber()).toBe(second.discountAmount.toNumber());
      expect(first.feeAmount.toNumber()).toBe(second.feeAmount.toNumber());
      expect(first.totalAmount.toNumber()).toBe(second.totalAmount.toNumber());
    });

    it('nao muta os objetos Decimal de entrada (calculo puro, sem efeito colateral)', () => {
      const cabinPrice = dec(1000);
      const addon = dec(50);
      const discount = dec(10);

      PricingEngine.calculate({ cabinPrice, passengerCount: 1, addonPrices: [addon], discountAmount: discount });

      expect(cabinPrice.toNumber()).toBe(1000);
      expect(addon.toNumber()).toBe(50);
      expect(discount.toNumber()).toBe(10);
    });
  });
});
