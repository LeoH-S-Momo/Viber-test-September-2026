import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, PaymentStatus } from '@prisma/client';
import type { InstallmentOptionView } from '@seapass/contracts';
import { AuditLogService } from '../../../audit/audit-log.service';
import { DomainEvent } from '../../../domain-events/domain-events';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { InstallmentPricing } from '../domain/installment-pricing';
import { PAYMENT_GATEWAY, type PaymentGateway } from '../domain/payment-gateway';
import { PaymentsRepository, type PaymentWithScope } from '../persistence/payments.repository';

export interface RefundView {
  id: string;
  amount: string;
  reason: string;
  status: string;
  createdAt: Date;
  processedAt: Date | null;
}

const REFUNDABLE_STATUSES: PaymentStatus[] = [PaymentStatus.APPROVED, PaymentStatus.PARTIALLY_REFUNDED];

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsRepository: PaymentsRepository,
    @Inject(PAYMENT_GATEWAY) private readonly paymentGateway: PaymentGateway,
    private readonly auditLog: AuditLogService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  getInstallmentOptions(amount: number): InstallmentOptionView[] {
    return InstallmentPricing.options(new Prisma.Decimal(amount)).map((option) => ({
      installments: option.installments,
      installmentAmount: option.installmentAmount.toFixed(2),
      totalAmount: option.totalAmount.toFixed(2),
      interestRate: option.interestRate,
    }));
  }

  async listRefunds(callerOrganizerId: string | null, paymentId: string): Promise<RefundView[]> {
    const payment = await this.assertScoped(callerOrganizerId, paymentId);
    return payment.refunds.map(this.toRefundView);
  }

  async listRefundsForBooking(userId: string, bookingId: string): Promise<RefundView[]> {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId }, select: { userId: true } });
    if (!booking || booking.userId !== userId) {
      throw new NotFoundException('Reserva nao encontrada.');
    }
    const refunds = await this.paymentsRepository.findRefundsForBooking(bookingId);
    return refunds.map(this.toRefundView);
  }

  /**
   * `callerOrganizerId` e `null` para PLATFORM_ADMIN (sem restricao) — qualquer outra coisa
   * exige que o pagamento pertenca a um cruzeiro DESTE organizador (404, nao 403, se nao bater —
   * ver ADR-0005). O organizerId nunca muda depois de criado, entao checar isto ANTES de travar
   * a linha (abaixo) nao abre nenhuma corrida.
   */
  async issueRefund(
    callerOrganizerId: string | null,
    paymentId: string,
    amount: Prisma.Decimal,
    reason: string,
    actorUserId: string,
  ): Promise<RefundView> {
    await this.assertScoped(callerOrganizerId, paymentId);

    const prepared = await this.prisma.$transaction(async (tx) => {
      const locked = await this.paymentsRepository.lockForUpdate(tx, paymentId);
      if (!locked) {
        throw new NotFoundException('Pagamento nao encontrado.');
      }
      if (!REFUNDABLE_STATUSES.includes(locked.status)) {
        throw new ConflictException('So e possivel reembolsar um pagamento aprovado.');
      }
      const alreadyRefunded = await this.paymentsRepository.sumCompletedRefunds(tx, paymentId);
      const remaining = locked.amount.minus(alreadyRefunded);
      if (amount.lte(0) || amount.gt(remaining)) {
        throw new ConflictException(`Valor de reembolso invalido — maximo reembolsavel: ${remaining.toFixed(2)}.`);
      }

      const refund = await this.paymentsRepository.createRefund(tx, { paymentId, amount, reason, actorUserId });
      return {
        refundId: refund.id,
        bookingId: locked.bookingId,
        gatewayTransactionId: locked.simulatedTransactionId,
        remainingAfter: remaining.minus(amount),
      };
    });

    // Fora de transacao — mesmo principio de checkout (nunca segurar o lock durante a chamada de
    // rede simulada, ver ADR-0012).
    const gatewayResult = await this.paymentGateway.refund({
      gatewayTransactionId: prepared.gatewayTransactionId,
      amount,
      reason,
    });

    const finalRefund = await this.prisma.$transaction(async (tx) => {
      if (gatewayResult.outcome === 'FAILED') {
        return this.paymentsRepository.updateRefundOutcome(tx, prepared.refundId, {
          status: 'FAILED',
          failureReason: gatewayResult.failureReason,
        });
      }

      const refund = await this.paymentsRepository.updateRefundOutcome(tx, prepared.refundId, {
        status: 'COMPLETED',
        gatewayRefundId: gatewayResult.gatewayRefundId,
      });
      const fullyRefunded = prepared.remainingAfter.lte(0);
      await this.paymentsRepository.updatePaymentStatus(
        tx,
        paymentId,
        fullyRefunded ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED,
      );
      if (fullyRefunded) {
        await this.paymentsRepository.markBookingRefundedIfConfirmed(tx, prepared.bookingId);
      }
      return refund;
    });

    if (finalRefund.status === 'COMPLETED') {
      await this.auditLog.record({
        actorUserId,
        action: 'payment.refunded',
        entityType: 'Payment',
        entityId: paymentId,
        metadata: { refundId: finalRefund.id, amount: amount.toString(), reason },
      });
      this.eventEmitter.emit(DomainEvent.PAYMENT_REFUNDED, {
        refundId: finalRefund.id,
        paymentId,
        bookingId: prepared.bookingId,
        amount: amount.toString(),
      });
    }

    return this.toRefundView(finalRefund);
  }

  private async assertScoped(callerOrganizerId: string | null, paymentId: string): Promise<PaymentWithScope> {
    const payment = await this.paymentsRepository.findByIdWithScope(paymentId);
    if (!payment || (callerOrganizerId !== null && payment.booking.cruise.organizerId !== callerOrganizerId)) {
      throw new NotFoundException('Pagamento nao encontrado.');
    }
    return payment;
  }

  private toRefundView(refund: { id: string; amount: Prisma.Decimal; reason: string; status: string; createdAt: Date; processedAt: Date | null }): RefundView {
    return {
      id: refund.id,
      amount: refund.amount.toFixed(2),
      reason: refund.reason,
      status: refund.status,
      createdAt: refund.createdAt,
      processedAt: refund.processedAt,
    };
  }
}
