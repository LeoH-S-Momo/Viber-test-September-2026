import { BadRequestException } from '@nestjs/common';

/**
 * Validacao da lista de hospedes de uma reserva (ver ADR-0010) — logica
 * pura. "Passageiro responsavel" (`Booking.userId`, a conta que fez a
 * reserva) e distinto de "hospede titular" (`BookingGuest.isPrimary`, quem
 * de fato viaja na cabine e e o titular perante a comissao de bordo) — a
 * mesma pessoa normalmente e as duas coisas, mas o dado modela os dois
 * papeis separadamente de proposito (ver comentario em BookingGuest no
 * schema.prisma).
 */
export interface GuestInput {
  isPrimary: boolean;
}

export class BookingGuestsPolicy {
  static assertValidGuestList(guests: GuestInput[], maxOccupancy: number): void {
    if (guests.length === 0) {
      throw new BadRequestException('A reserva precisa de pelo menos um hospede.');
    }
    if (guests.length > maxOccupancy) {
      throw new BadRequestException(
        `Esta cabine comporta no maximo ${maxOccupancy} ${maxOccupancy === 1 ? 'hospede' : 'hospedes'}.`,
      );
    }
    const primaryCount = guests.filter((guest) => guest.isPrimary).length;
    if (primaryCount !== 1) {
      throw new BadRequestException('Exatamente um hospede precisa ser marcado como titular (isPrimary).');
    }
  }
}
