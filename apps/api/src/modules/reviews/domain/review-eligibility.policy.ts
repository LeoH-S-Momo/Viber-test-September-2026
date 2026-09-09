import { ConflictException, NotFoundException } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';

export interface ReviewEligibilityBooking {
  userId: string;
  status: BookingStatus;
}

export interface ReviewEligibilityCruise {
  disembarkationDate: Date;
}

/**
 * "So pode avaliar depois que a viagem acaba" — reserva precisa estar CONFIRMED (nunca foi
 * cancelada) e o cruzeiro precisa ja ter desembarcado. `hasExistingReview` cobre "uma avaliacao
 * por reserva" (ver Review.bookingId @unique no schema — a policy checa antes pra devolver uma
 * mensagem clara em vez de estourar a constraint do banco).
 */
export class ReviewEligibilityPolicy {
  static assertOwnership(booking: ReviewEligibilityBooking, userId: string): void {
    if (booking.userId !== userId) {
      throw new NotFoundException('Reserva nao encontrada.');
    }
  }

  static assertEligible(
    booking: ReviewEligibilityBooking,
    cruise: ReviewEligibilityCruise,
    hasExistingReview: boolean,
    now: Date = new Date(),
  ): void {
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new ConflictException('So e possivel avaliar reservas confirmadas.');
    }
    if (cruise.disembarkationDate >= now) {
      throw new ConflictException('A avaliacao so fica disponivel depois do desembarque.');
    }
    if (hasExistingReview) {
      throw new ConflictException('Esta reserva ja foi avaliada.');
    }
  }
}
