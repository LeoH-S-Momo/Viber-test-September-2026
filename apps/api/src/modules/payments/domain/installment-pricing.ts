import { Prisma } from '@prisma/client';

export interface InstallmentOption {
  installments: number;
  installmentAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  /** Taxa mensal usada (0 para 1x — a vista, sem juros). */
  interestRate: number;
}

/**
 * Faixas de juros do parcelamento no cartao (mockado — nao ha gateway real, ver ADR do
 * parcelamento): 1x sempre a vista, sem juros; 2x-6x e 7x-12x usam taxas mensais fixas maiores
 * quanto mais parcelas, o mesmo formato de uma tabela de juros de cartao real.
 */
const RATE_TIERS: Array<{ maxInstallments: number; monthlyRate: number }> = [
  { maxInstallments: 1, monthlyRate: 0 },
  { maxInstallments: 6, monthlyRate: 0.0199 },
  { maxInstallments: 12, monthlyRate: 0.0249 },
];

function monthlyRateFor(installments: number): number {
  return RATE_TIERS.find((tier) => installments <= tier.maxInstallments)!.monthlyRate;
}

/**
 * Tabela Price (juros compostos): cada parcela tem o mesmo valor, calculado pra que a soma das
 * parcelas amortize o valor presente (`amount`) a taxa mensal da faixa — a mesma logica de
 * financiamento parcelado usada por maquininhas/gateways de cartao de verdade.
 */
export class InstallmentPricing {
  static calculate(amount: Prisma.Decimal, installments: number): InstallmentOption {
    const interestRate = monthlyRateFor(installments);

    let installmentAmount: Prisma.Decimal;
    if (interestRate === 0) {
      installmentAmount = amount.div(installments).toDecimalPlaces(2);
    } else {
      const i = new Prisma.Decimal(interestRate);
      const factor = i.plus(1).pow(installments);
      installmentAmount = amount.mul(i).mul(factor).div(factor.minus(1)).toDecimalPlaces(2);
    }

    return {
      installments,
      installmentAmount,
      totalAmount: installmentAmount.mul(installments),
      interestRate,
    };
  }

  static options(amount: Prisma.Decimal, maxInstallments = 12): InstallmentOption[] {
    return Array.from({ length: maxInstallments }, (_, index) => this.calculate(amount, index + 1));
  }
}
