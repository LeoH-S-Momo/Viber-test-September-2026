import { Module } from '@nestjs/common';
import { PAYMENT_GATEWAY } from './domain/payment-gateway';
import { FakePaymentGateway } from './infrastructure/fake-payment-gateway';

/**
 * Unico lugar do projeto que sabe qual implementacao de `PaymentGateway`
 * esta em uso. Trocar `FakePaymentGateway` por um gateway real e mudar esta
 * linha (e as credenciais/config que a nova classe precisar) — nenhum
 * import de `FakePaymentGateway` existe fora deste arquivo (ver
 * docs/architecture/decisions/0012-checkout-payment-gateway.md).
 */
@Module({
  providers: [{ provide: PAYMENT_GATEWAY, useClass: FakePaymentGateway }],
  exports: [PAYMENT_GATEWAY],
})
export class PaymentsModule {}
