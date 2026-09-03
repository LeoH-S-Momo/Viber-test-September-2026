import { ConflictException, NotFoundException } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';

/**
 * Maquina de estados do motor de disponibilidade de cabine (ver ADR-0009):
 *
 *   AVAILABLE --(holdCabin)--> HELD --(confirmBooking)--> CONFIRMED ("BOOKED")
 *   HELD --(hold expira, cancelBooking ou releaseHold)--> CANCELLED ("AVAILABLE" de novo)
 *   CONFIRMED --(cancelBooking)--> CANCELLED
 *
 * "AVAILABLE" nunca e um valor de BookingStatus — e a AUSENCIA de uma
 * reserva HELD/CONFIRMED ativa para aquela cabine+cruzeiro (ver
 * CabinAvailabilityPolicy, em catalog/domain, que projeta esse estado
 * calculado para leitura). Este arquivo so guarda as transicoes validas de
 * uma linha de Booking que ja existe.
 *
 * Logica pura, sem Prisma/NestJS injetado — testada isoladamente (ver
 * cabin-hold.policy.spec.ts), no mesmo espirito de CruiseStatusPolicy
 * (ADR-0006). As excecoes SAO importadas do Nest (como CruiseStatusPolicy ja
 * fazia) porque a resposta HTTP apropriada e parte da regra de negocio em
 * si (ex: hold de outro usuario deve dar 404, nao 403 — ver ADR-0005), nao
 * um detalhe de transporte que caberia so na camada de apresentacao.
 */
export interface HoldableBooking {
  id: string;
  userId: string;
  status: BookingStatus;
  holdExpiresAt: Date | null;
}

export class CabinHoldPolicy {
  /** now + minutos de retencao, configuravel (CABIN_HOLD_MINUTES, default 15 — ver bookings.module.ts). */
  static computeHoldExpiry(now: Date, holdMinutes: number): Date {
    return new Date(now.getTime() + holdMinutes * 60_000);
  }

  static isHoldExpired(booking: Pick<HoldableBooking, 'holdExpiresAt'>, now: Date): boolean {
    return booking.holdExpiresAt !== null && booking.holdExpiresAt.getTime() <= now.getTime();
  }

  /** Dono da reserva confere posse antes de qualquer transicao — 404 (nao 403) pra quem nao e dono, ver ADR-0005. */
  static assertOwnership(booking: Pick<HoldableBooking, 'userId'>, userId: string): void {
    if (booking.userId !== userId) {
      throw new NotFoundException('Reserva nao encontrada.');
    }
  }

  /** Confirmar so e valido a partir de HELD, e so antes do hold expirar. */
  static assertCanConfirm(booking: HoldableBooking, now: Date): void {
    if (booking.status !== BookingStatus.HELD) {
      throw new ConflictException(
        `Nao e possivel confirmar uma reserva com status ${booking.status} (precisa estar HELD).`,
      );
    }
    if (this.isHoldExpired(booking, now)) {
      throw new ConflictException('O prazo de retencao desta cabine expirou — faca um novo hold.');
    }
  }

  /** Cancelar funciona em HELD ou CONFIRMED — o "cancelamento" generico pedido. */
  static assertCanCancel(booking: HoldableBooking): void {
    if (booking.status !== BookingStatus.HELD && booking.status !== BookingStatus.CONFIRMED) {
      throw new ConflictException(
        `Nao e possivel cancelar uma reserva com status ${booking.status}.`,
      );
    }
  }

  /**
   * "Liberar" e mais estreito que cancelar: so faz sentido abandonar um
   * hold que ainda nao virou reserva confirmada. Tentar liberar uma reserva
   * CONFIRMED e um erro de uso (o cliente deveria chamar cancelBooking).
   */
  static assertCanRelease(booking: HoldableBooking): void {
    if (booking.status !== BookingStatus.HELD) {
      throw new ConflictException(
        booking.status === BookingStatus.CONFIRMED
          ? 'Esta reserva ja foi confirmada — use o cancelamento, nao a liberacao de hold.'
          : `Nao e possivel liberar uma reserva com status ${booking.status}.`,
      );
    }
  }
}
