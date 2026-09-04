import { ConflictException, NotFoundException } from '@nestjs/common';
import { BookingStatus, TicketStatus } from '@prisma/client';

/** Os quatro estados possiveis de uma tentativa de check-in — ver ADR-0013. */
export type CheckInOutcome = 'NOT_CHECKED_IN' | 'CHECKED_IN' | 'INVALID' | 'ALREADY_USED';

export interface CheckInCandidate {
  ticketStatus: TicketStatus;
  bookingStatus: BookingStatus;
}

/**
 * Regras de validacao de check-in — logica pura, sem Prisma/NestJS
 * injetado (mesmo espirito de BookingLifecyclePolicy/CouponPolicy). Um
 * ticket so pode ser embarcado (`CHECKED_IN`) a partir de exatamente um
 * estado: `ISSUED` numa reserva `CONFIRMED`. Qualquer outra combinacao e
 * `INVALID` (reserva nao confirmada, ou o ticket foi cancelado — ver
 * TicketsService.cancelTicketsForBooking, chamado quando uma reserva
 * confirmada e cancelada depois de os tickets ja terem sido emitidos) ou
 * `ALREADY_USED` (o unico caso em que o ticket em si esta correto, so ja
 * foi consumido).
 *
 * A tabela `CheckIn` continua sem constraint de unicidade por ticket de
 * proposito (ver comentario no schema, `checkIns[]` como log de reembarques
 * futuros) — a regra de "uso unico" pedida aqui e imposta nesta camada,
 * sobre `Ticket.status`, nao no banco: o embarque inicial (este modulo) e
 * distinto de um eventual reembarque pos-escala em porto (fora de escopo).
 */
export class CheckInPolicy {
  static evaluate(candidate: CheckInCandidate | null): CheckInOutcome {
    if (!candidate) {
      return 'INVALID';
    }
    if (candidate.bookingStatus !== BookingStatus.CONFIRMED) {
      return 'INVALID';
    }
    if (candidate.ticketStatus === TicketStatus.CANCELLED) {
      return 'INVALID';
    }
    if (candidate.ticketStatus === TicketStatus.CHECKED_IN) {
      return 'ALREADY_USED';
    }
    return 'NOT_CHECKED_IN';
  }

  /** Usado pelo endpoint de confirmacao — mesma regra de `evaluate`, mas vira excecao HTTP (mutacao, nao consulta). */
  static assertCanCheckIn(candidate: CheckInCandidate | null): void {
    const outcome = this.evaluate(candidate);
    if (outcome === 'NOT_CHECKED_IN') {
      return;
    }
    if (outcome === 'ALREADY_USED') {
      throw new ConflictException('Este ticket ja foi utilizado.');
    }
    // INVALID: distingue "nao existe" (404) de "existe mas nao pode ser usado agora" (409).
    if (!candidate) {
      throw new NotFoundException('Ticket nao encontrado.');
    }
    if (candidate.bookingStatus !== BookingStatus.CONFIRMED) {
      throw new ConflictException('A reserva deste ticket nao esta confirmada.');
    }
    throw new ConflictException('Este ticket foi cancelado.');
  }
}
