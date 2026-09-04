import { ConflictException, NotFoundException } from '@nestjs/common';
import { BookingStatus, TicketStatus } from '@prisma/client';
import { CheckInPolicy, type CheckInCandidate } from '../../src/modules/tickets/domain/check-in.policy';

function candidate(overrides: Partial<CheckInCandidate> = {}): CheckInCandidate {
  return {
    ticketStatus: TicketStatus.ISSUED,
    bookingStatus: BookingStatus.CONFIRMED,
    ...overrides,
  };
}

describe('CheckInPolicy', () => {
  describe('evaluate', () => {
    it('NOT_CHECKED_IN para um ticket ISSUED de uma reserva CONFIRMED (o caso valido)', () => {
      expect(CheckInPolicy.evaluate(candidate())).toBe('NOT_CHECKED_IN');
    });

    it('CHECKED_IN quando o ticket ja foi utilizado', () => {
      expect(CheckInPolicy.evaluate(candidate({ ticketStatus: TicketStatus.CHECKED_IN }))).toBe('ALREADY_USED');
    });

    it('INVALID quando nao existe ticket nenhum para o codigo (candidate null)', () => {
      expect(CheckInPolicy.evaluate(null)).toBe('INVALID');
    });

    it.each([
      BookingStatus.HELD,
      BookingStatus.PAYMENT_PENDING,
      BookingStatus.CANCELLED,
      BookingStatus.EXPIRED,
      BookingStatus.REFUNDED,
    ])('INVALID quando a reserva nao esta CONFIRMED (status %s)', (bookingStatus) => {
      expect(CheckInPolicy.evaluate(candidate({ bookingStatus }))).toBe('INVALID');
    });

    it('INVALID quando o proprio ticket foi cancelado, mesmo com a reserva CONFIRMED', () => {
      expect(CheckInPolicy.evaluate(candidate({ ticketStatus: TicketStatus.CANCELLED }))).toBe('INVALID');
    });

    it('reserva nao confirmada tem precedencia sobre "ja utilizado" quando ambos seriam verdade', () => {
      // Nao deveria ser um estado alcancavel de verdade (ver TicketsService.cancelTicketsForBooking),
      // mas a ordem de checagem precisa ser deterministica mesmo assim.
      const outcome = CheckInPolicy.evaluate(
        candidate({ ticketStatus: TicketStatus.CHECKED_IN, bookingStatus: BookingStatus.CANCELLED }),
      );
      expect(outcome).toBe('INVALID');
    });
  });

  describe('assertCanCheckIn', () => {
    it('nao lanca para o caso valido (NOT_CHECKED_IN)', () => {
      expect(() => CheckInPolicy.assertCanCheckIn(candidate())).not.toThrow();
    });

    it('lanca ConflictException com mensagem distinta para um ticket ja utilizado', () => {
      expect(() => CheckInPolicy.assertCanCheckIn(candidate({ ticketStatus: TicketStatus.CHECKED_IN }))).toThrow(
        ConflictException,
      );
      expect(() => CheckInPolicy.assertCanCheckIn(candidate({ ticketStatus: TicketStatus.CHECKED_IN }))).toThrow(
        /ja foi utilizado/,
      );
    });

    it('lanca NotFoundException (nao ConflictException) quando o ticket nao existe', () => {
      expect(() => CheckInPolicy.assertCanCheckIn(null)).toThrow(NotFoundException);
    });

    it('lanca ConflictException com mensagem distinta quando a reserva nao esta confirmada', () => {
      expect(() =>
        CheckInPolicy.assertCanCheckIn(candidate({ bookingStatus: BookingStatus.HELD })),
      ).toThrow(/nao esta confirmada/);
    });

    it('lanca ConflictException com mensagem distinta quando o ticket foi cancelado', () => {
      expect(() =>
        CheckInPolicy.assertCanCheckIn(candidate({ ticketStatus: TicketStatus.CANCELLED })),
      ).toThrow(/foi cancelado/);
    });
  });
});
