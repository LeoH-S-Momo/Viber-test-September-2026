import { ConflictException, NotFoundException } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';

/**
 * Maquina de estados do dominio de Booking (ver ADR-0009 para o motor de
 * hold/concorrencia original, ADR-0010 para o fluxo completo de reserva):
 *
 *   AVAILABLE --(holdCabin)--------------> HELD
 *   HELD      --(updateDetails)*---------> HELD           (hospedes/adicionais, repetivel)
 *   HELD      --(checkout)---------------> PAYMENT_PENDING (paga simulado criado)
 *   PAYMENT_PENDING --(confirmPayment)----> CONFIRMED       ("BOOKED")
 *   HELD | PAYMENT_PENDING --(hold expira)--> EXPIRED        (sempre disparado pelo sistema)
 *   HELD | PAYMENT_PENDING | CONFIRMED --(cancelBooking)--> CANCELLED (sempre uma decisao do usuario)
 *   HELD --(releaseHold)------------------> CANCELLED       (abandonar antes mesmo do checkout)
 *
 * "AVAILABLE" nunca e um valor de BookingStatus — e a AUSENCIA de uma
 * reserva HELD/PAYMENT_PENDING/CONFIRMED ativa para aquela cabine+cruzeiro
 * (ver CabinAvailabilityPolicy, em catalog/domain, que projeta esse estado
 * calculado para leitura). Este arquivo so guarda as transicoes validas de
 * uma linha de Booking que ja existe.
 *
 * EXPIRED e CANCELLED sao desfechos distintos de proposito (ver ADR-0010):
 * EXPIRED e sempre o sistema fechando um hold cujo prazo estourou; CANCELLED
 * e sempre uma decisao explicita de alguem (usuario cancelando, ou liberando
 * um hold que nem chegou a virar checkout).
 *
 * Logica pura, sem Prisma/NestJS injetado — testada isoladamente (ver
 * booking-lifecycle.policy.spec.ts), no mesmo espirito de CruiseStatusPolicy
 * (ADR-0006). As excecoes SAO importadas do Nest (como CruiseStatusPolicy ja
 * fazia) porque a resposta HTTP apropriada e parte da regra de negocio em
 * si (ex: mexer na reserva de outro usuario deve dar 404, nao 403 — ver
 * ADR-0005), nao um detalhe de transporte que caberia so na apresentacao.
 */
export interface LifecycleBooking {
  id: string;
  userId: string;
  status: BookingStatus;
  holdExpiresAt: Date | null;
}

const ACTIVE_STATUSES: BookingStatus[] = [
  BookingStatus.HELD,
  BookingStatus.PAYMENT_PENDING,
  BookingStatus.CONFIRMED,
];

export class BookingLifecyclePolicy {
  /** now + minutos de retencao, configuravel (CABIN_HOLD_MINUTES, default 15 — ver bookings.module.ts). */
  static computeHoldExpiry(now: Date, holdMinutes: number): Date {
    return new Date(now.getTime() + holdMinutes * 60_000);
  }

  static isHoldExpired(booking: Pick<LifecycleBooking, 'holdExpiresAt'>, now: Date): boolean {
    return booking.holdExpiresAt !== null && booking.holdExpiresAt.getTime() <= now.getTime();
  }

  static isActive(status: BookingStatus): boolean {
    return ACTIVE_STATUSES.includes(status);
  }

  /** Dono da reserva confere posse antes de qualquer transicao — 404 (nao 403) pra quem nao e dono, ver ADR-0005. */
  static assertOwnership(booking: Pick<LifecycleBooking, 'userId'>, userId: string): void {
    if (booking.userId !== userId) {
      throw new NotFoundException('Reserva nao encontrada.');
    }
  }

  /** Hospedes/adicionais/cupom so podem ser editados enquanto a reserva ainda esta sendo montada. */
  static assertCanEditDetails(booking: LifecycleBooking, now: Date): void {
    if (booking.status !== BookingStatus.HELD) {
      throw new ConflictException(
        `Nao e possivel editar hospedes/adicionais de uma reserva com status ${booking.status} (precisa estar HELD).`,
      );
    }
    if (this.isHoldExpired(booking, now)) {
      throw new ConflictException('O prazo de retencao desta cabine expirou — faca um novo hold.');
    }
  }

  /** Ir para o checkout (criar o pagamento simulado) so e valido a partir de HELD, e so antes do hold expirar. */
  static assertCanCheckout(booking: LifecycleBooking, now: Date): void {
    if (booking.status !== BookingStatus.HELD) {
      throw new ConflictException(
        `Nao e possivel iniciar o checkout de uma reserva com status ${booking.status} (precisa estar HELD).`,
      );
    }
    if (this.isHoldExpired(booking, now)) {
      throw new ConflictException('O prazo de retencao desta cabine expirou — faca um novo hold.');
    }
  }

  /**
   * Confirmar pagamento so e valido a partir de PAYMENT_PENDING. Idempotente
   * de proposito para CONFIRMED (um callback de gateway simulado retentado
   * nao deve falhar so porque ja foi processado — ver ADR-0010).
   */
  static assertCanConfirmPayment(booking: LifecycleBooking): void {
    if (booking.status === BookingStatus.CONFIRMED) {
      return;
    }
    if (booking.status !== BookingStatus.PAYMENT_PENDING) {
      throw new ConflictException(
        `Nao e possivel confirmar o pagamento de uma reserva com status ${booking.status} (precisa estar PAYMENT_PENDING).`,
      );
    }
  }

  /** Cancelar funciona em qualquer estado ativo (HELD, PAYMENT_PENDING ou CONFIRMED) — o "cancelamento" generico pedido. */
  static assertCanCancel(booking: LifecycleBooking): void {
    if (!this.isActive(booking.status)) {
      throw new ConflictException(`Nao e possivel cancelar uma reserva com status ${booking.status}.`);
    }
  }

  /**
   * "Liberar" e mais estreito que cancelar: so faz sentido abandonar um
   * hold que ainda nao chegou nem ao checkout. Tentar liberar depois disso
   * e um erro de uso (o cliente deveria chamar cancelBooking).
   */
  static assertCanRelease(booking: LifecycleBooking): void {
    if (booking.status !== BookingStatus.HELD) {
      throw new ConflictException(
        booking.status === BookingStatus.PAYMENT_PENDING || booking.status === BookingStatus.CONFIRMED
          ? 'Esta reserva ja avancou para o checkout — use o cancelamento, nao a liberacao de hold.'
          : `Nao e possivel liberar uma reserva com status ${booking.status}.`,
      );
    }
  }
}
