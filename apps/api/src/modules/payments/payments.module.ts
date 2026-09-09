import { Module } from '@nestjs/common';
import { PAYMENT_GATEWAY } from './domain/payment-gateway';
import { FakePaymentGateway } from './infrastructure/fake-payment-gateway';
import { PaymentsController } from './presentation/payments.controller';
import { PaymentsService } from './application/payments.service';
import { PaymentsRepository } from './persistence/payments.repository';

/**
 * Unico lugar do projeto que sabe qual implementacao de `PaymentGateway`
 * esta em uso. Trocar `FakePaymentGateway` por um gateway real e mudar esta
 * linha (e as credenciais/config que a nova classe precisar) — nenhum
 * import de `FakePaymentGateway` existe fora deste arquivo (ver
 * docs/architecture/decisions/0012-checkout-payment-gateway.md). Tambem
 * expoe `PaymentsController` (reembolso/parcelamento — ver
 * docs/architecture/decisions do reembolso), que so depende do gateway
 * definido aqui, nao de BookingsModule.
 */
@Module({
  controllers: [PaymentsController],
  providers: [{ provide: PAYMENT_GATEWAY, useClass: FakePaymentGateway }, PaymentsService, PaymentsRepository],
  exports: [PAYMENT_GATEWAY],
})
export class PaymentsModule {}
