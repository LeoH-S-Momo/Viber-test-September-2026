import { ConflictException, NotFoundException } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { CabinHoldPolicy, type HoldableBooking } from '../../src/modules/bookings/domain/cabin-hold.policy';

function booking(overrides: Partial<HoldableBooking> = {}): HoldableBooking {
  return {
    id: 'booking-1',
    userId: 'user-1',
    status: BookingStatus.HELD,
    holdExpiresAt: new Date('2026-06-01T12:15:00Z'),
    ...overrides,
  };
}

describe('CabinHoldPolicy', () => {
  describe('computeHoldExpiry', () => {
    it('adds the configured number of minutes to now', () => {
      const now = new Date('2026-06-01T12:00:00Z');
      expect(CabinHoldPolicy.computeHoldExpiry(now, 15)).toEqual(new Date('2026-06-01T12:15:00Z'));
    });

    it('respects a different configured duration', () => {
      const now = new Date('2026-06-01T12:00:00Z');
      expect(CabinHoldPolicy.computeHoldExpiry(now, 5)).toEqual(new Date('2026-06-01T12:05:00Z'));
    });
  });

  describe('isHoldExpired', () => {
    it('is false when holdExpiresAt is in the future', () => {
      const now = new Date('2026-06-01T12:00:00Z');
      expect(CabinHoldPolicy.isHoldExpired({ holdExpiresAt: new Date('2026-06-01T12:10:00Z') }, now)).toBe(false);
    });

    it('is true when holdExpiresAt is exactly now or in the past', () => {
      const now = new Date('2026-06-01T12:00:00Z');
      expect(CabinHoldPolicy.isHoldExpired({ holdExpiresAt: now }, now)).toBe(true);
      expect(CabinHoldPolicy.isHoldExpired({ holdExpiresAt: new Date('2026-06-01T11:59:00Z') }, now)).toBe(true);
    });

    it('is false when there is no holdExpiresAt at all', () => {
      expect(CabinHoldPolicy.isHoldExpired({ holdExpiresAt: null }, new Date())).toBe(false);
    });
  });

  describe('assertOwnership', () => {
    it('does not throw when the caller owns the booking', () => {
      expect(() => CabinHoldPolicy.assertOwnership(booking({ userId: 'user-1' }), 'user-1')).not.toThrow();
    });

    it('throws NotFoundException (not Forbidden) when the caller is a different user', () => {
      expect(() => CabinHoldPolicy.assertOwnership(booking({ userId: 'user-1' }), 'user-2')).toThrow(
        NotFoundException,
      );
    });
  });

  describe('assertCanConfirm', () => {
    const now = new Date('2026-06-01T12:00:00Z');

    it('allows confirming a HELD booking whose hold has not expired', () => {
      const b = booking({ status: BookingStatus.HELD, holdExpiresAt: new Date('2026-06-01T12:10:00Z') });
      expect(() => CabinHoldPolicy.assertCanConfirm(b, now)).not.toThrow();
    });

    it('rejects confirming a booking that is not HELD', () => {
      const b = booking({ status: BookingStatus.CONFIRMED });
      expect(() => CabinHoldPolicy.assertCanConfirm(b, now)).toThrow(ConflictException);
    });

    it('rejects confirming a HELD booking whose hold already expired', () => {
      const b = booking({ status: BookingStatus.HELD, holdExpiresAt: new Date('2026-06-01T11:59:00Z') });
      expect(() => CabinHoldPolicy.assertCanConfirm(b, now)).toThrow(/expirou/);
    });
  });

  describe('assertCanCancel', () => {
    it.each([BookingStatus.HELD, BookingStatus.CONFIRMED])('allows cancelling a %s booking', (status) => {
      expect(() => CabinHoldPolicy.assertCanCancel(booking({ status }))).not.toThrow();
    });

    it.each([BookingStatus.CANCELLED, BookingStatus.COMPLETED, BookingStatus.REFUNDED])(
      'rejects cancelling an already-%s booking',
      (status) => {
        expect(() => CabinHoldPolicy.assertCanCancel(booking({ status }))).toThrow(ConflictException);
      },
    );
  });

  describe('assertCanRelease', () => {
    it('allows releasing a HELD booking', () => {
      expect(() => CabinHoldPolicy.assertCanRelease(booking({ status: BookingStatus.HELD }))).not.toThrow();
    });

    it('rejects releasing a CONFIRMED booking with a message pointing to cancel instead', () => {
      expect(() => CabinHoldPolicy.assertCanRelease(booking({ status: BookingStatus.CONFIRMED }))).toThrow(
        /cancelamento/,
      );
    });

    it('rejects releasing an already-CANCELLED booking', () => {
      expect(() => CabinHoldPolicy.assertCanRelease(booking({ status: BookingStatus.CANCELLED }))).toThrow(
        ConflictException,
      );
    });
  });
});
