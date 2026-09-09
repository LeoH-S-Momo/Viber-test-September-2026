import { ConflictException, NotFoundException } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import {
  ReviewEligibilityPolicy,
  type ReviewEligibilityBooking,
  type ReviewEligibilityCruise,
} from '../../src/modules/reviews/domain/review-eligibility.policy';

const NOW = new Date('2026-06-01T12:00:00Z');
const PAST = new Date('2026-05-01T00:00:00Z');
const FUTURE = new Date('2026-12-01T00:00:00Z');

function booking(overrides: Partial<ReviewEligibilityBooking> = {}): ReviewEligibilityBooking {
  return { userId: 'user-1', status: BookingStatus.CONFIRMED, ...overrides };
}

describe('ReviewEligibilityPolicy', () => {
  describe('assertOwnership', () => {
    it('lanca 404 quando a reserva pertence a outro usuario (nunca 403 — nao confirma a existencia do recurso)', () => {
      expect(() => ReviewEligibilityPolicy.assertOwnership(booking({ userId: 'other-user' }), 'user-1')).toThrow(
        NotFoundException,
      );
    });

    it('nao lanca quando a reserva pertence ao usuario', () => {
      expect(() => ReviewEligibilityPolicy.assertOwnership(booking({ userId: 'user-1' }), 'user-1')).not.toThrow();
    });
  });

  describe('assertEligible', () => {
    it('rejeita reserva que nunca foi CONFIRMED', () => {
      expect(() =>
        ReviewEligibilityPolicy.assertEligible(booking({ status: BookingStatus.CANCELLED }), { disembarkationDate: PAST }, false, NOW),
      ).toThrow(ConflictException);
    });

    it('rejeita quando a viagem ainda nao terminou', () => {
      expect(() =>
        ReviewEligibilityPolicy.assertEligible(booking(), { disembarkationDate: FUTURE }, false, NOW),
      ).toThrow(ConflictException);
    });

    it('rejeita quando ja existe uma avaliacao para esta reserva', () => {
      expect(() =>
        ReviewEligibilityPolicy.assertEligible(booking(), { disembarkationDate: PAST }, true, NOW),
      ).toThrow(ConflictException);
    });

    it('permite quando confirmada, viagem encerrada e sem avaliacao previa', () => {
      expect(() =>
        ReviewEligibilityPolicy.assertEligible(booking(), { disembarkationDate: PAST }, false, NOW),
      ).not.toThrow();
    });
  });
});
