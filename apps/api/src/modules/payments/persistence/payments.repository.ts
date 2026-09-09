import { Injectable } from '@nestjs/common';
import { Prisma, PaymentStatus, RefundStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';

const SCOPE_INCLUDE = {
  booking: { select: { id: true, status: true, userId: true, cruise: { select: { organizerId: true, title: true } } } },
  refunds: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.PaymentInclude;

export type PaymentWithScope = Prisma.PaymentGetPayload<{ include: typeof SCOPE_INCLUDE }>;

interface LockedPayment {
  id: string;
  status: PaymentStatus;
  amount: Prisma.Decimal;
  bookingId: string;
  simulatedTransactionId: string;
}

@Injectable()
export class PaymentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByIdWithScope(id: string): Promise<PaymentWithScope | null> {
    return this.prisma.payment.findUnique({ where: { id }, include: SCOPE_INCLUDE });
  }

  /** Mesmo principio de `BookingsRepository.lockBookingForUpdate` (ADR-0009/0012) — trava a linha do pagamento antes de somar reembolsos ja feitos, pra dois reembolsos concorrentes nunca ultrapassarem juntos o valor pago. */
  async lockForUpdate(tx: Prisma.TransactionClient, id: string): Promise<LockedPayment | null> {
    const rows = await tx.$queryRaw<LockedPayment[]>`
      SELECT id, status, amount, "bookingId", "simulatedTransactionId" FROM payments WHERE id = ${id} FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  async sumCompletedRefunds(tx: Prisma.TransactionClient, paymentId: string): Promise<Prisma.Decimal> {
    const result = await tx.refund.aggregate({
      where: { paymentId, status: RefundStatus.COMPLETED },
      _sum: { amount: true },
    });
    return result._sum.amount ?? new Prisma.Decimal(0);
  }

  createRefund(
    tx: Prisma.TransactionClient,
    data: { paymentId: string; amount: Prisma.Decimal; reason: string; actorUserId: string },
  ) {
    return tx.refund.create({ data });
  }

  updateRefundOutcome(
    tx: Prisma.TransactionClient,
    refundId: string,
    data: { status: RefundStatus; gatewayRefundId?: string; failureReason?: string },
  ) {
    return tx.refund.update({ where: { id: refundId }, data: { ...data, processedAt: new Date() } });
  }

  updatePaymentStatus(tx: Prisma.TransactionClient, paymentId: string, status: PaymentStatus) {
    return tx.payment.update({ where: { id: paymentId }, data: { status } });
  }

  /** So mexe se a reserva ainda estiver CONFIRMED — um reembolso total de uma reserva ja cancelada nao deveria "reabrir" o status dela. */
  markBookingRefundedIfConfirmed(tx: Prisma.TransactionClient, bookingId: string) {
    return tx.booking.updateMany({ where: { id: bookingId, status: 'CONFIRMED' }, data: { status: 'REFUNDED' } });
  }

  /** Visao do passageiro (GET bookings/:id/refunds) — todos os pagamentos da reserva podem ter reembolso, nao so o mais recente. */
  findRefundsForBooking(bookingId: string) {
    return this.prisma.refund.findMany({ where: { payment: { bookingId } }, orderBy: { createdAt: 'desc' } });
  }
}
