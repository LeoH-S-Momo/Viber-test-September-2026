import { ConflictException, NotFoundException } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { BookingLifecyclePolicy, type LifecycleBooking } from '../../src/modules/bookings/domain/booking-lifecycle.policy';

function booking(overrides: Partial<LifecycleBooking> = {}): LifecycleBooking {
  return {
    id: 'booking-1',
    userId: 'user-1',
    status: BookingStatus.HELD,
    holdExpiresAt: new Date('2026-06-01T12:15:00Z'),
    ...overrides,
  };
}

describe('BookingLifecyclePolicy', () => {
  describe('computeHoldExpiry / isHoldExpired', () => {
    it('adds the configured number of minutes to now', () => {
      const now = new Date('2026-06-01T12:00:00Z');
      expect(BookingLifecyclePolicy.computeHoldExpiry(now, 15)).toEqual(new Date('2026-06-01T12:15:00Z'));
    });

    it('is expired exactly at or after holdExpiresAt, not before', () => {
      const now = new Date('2026-06-01T12:00:00Z');
      expect(BookingLifecyclePolicy.isHoldExpired({ holdExpiresAt: now }, now)).toBe(true);
      expect(
        BookingLifecyclePolicy.isHoldExpired({ holdExpiresAt: new Date('2026-06-01T12:00:01Z') }, now),
      ).toBe(false);
    });
  });

  describe('isActive', () => {
    it.each([BookingStatus.HELD, BookingStatus.PAYMENT_PENDING, BookingStatus.CONFIRMED])(
      '%s is active',
      (status) => {
        expect(BookingLifecyclePolicy.isActive(status)).toBe(true);
      },
    );

    it.each([BookingStatus.CANCELLED, BookingStatus.EXPIRED, BookingStatus.COMPLETED, BookingStatus.REFUNDED])(
      '%s is not active',
      (status) => {
        expect(BookingLifecyclePolicy.isActive(status)).toBe(false);
      },
    );
  });

  describe('assertOwnership', () => {
    it('throws NotFoundException (not Forbidden) for a different user', () => {
      expect(() => BookingLifecyclePolicy.assertOwnership(booking({ userId: 'owner' }), 'someone-else')).toThrow(
        NotFoundException,
      );
    });

    it('does not throw for the owner', () => {
      expect(() => BookingLifecyclePolicy.assertOwnership(booking({ userId: 'owner' }), 'owner')).not.toThrow();
    });
  });

  describe('assertCanEditDetails', () => {
    const now = new Date('2026-06-01T12:00:00Z');

    it('allows editing a HELD booking whose hold has not expired', () => {
      const b = booking({ status: BookingStatus.HELD, holdExpiresAt: new Date('2026-06-01T12:10:00Z') });
      expect(() => BookingLifecyclePolicy.assertCanEditDetails(b, now)).not.toThrow();
    });

    it('rejects editing a booking that already moved past HELD', () => {
      const b = booking({ status: BookingStatus.PAYMENT_PENDING });
      expect(() => BookingLifecyclePolicy.assertCanEditDetails(b, now)).toThrow(ConflictException);
    });

    it('rejects editing a HELD booking whose hold already expired', () => {
      const b = booking({ status: BookingStatus.HELD, holdExpiresAt: new Date('2026-06-01T11:59:00Z') });
      expect(() => BookingLifecyclePolicy.assertCanEditDetails(b, now)).toThrow(/expirou/);
    });
  });

  describe('assertCanCheckout', () => {
    const now = new Date('2026-06-01T12:00:00Z');

    it('allows checkout from HELD before expiry', () => {
      const b = booking({ status: BookingStatus.HELD, holdExpiresAt: new Date('2026-06-01T12:10:00Z') });
      expect(() => BookingLifecyclePolicy.assertCanCheckout(b, now)).not.toThrow();
    });

    it('rejects checkout from any status other than HELD', () => {
      const b = booking({ status: BookingStatus.PAYMENT_PENDING });
      expect(() => BookingLifecyclePolicy.assertCanCheckout(b, now)).toThrow(ConflictException);
    });

    it('rejects checkout once the hold has expired', () => {
      const b = booking({ status: BookingStatus.HELD, holdExpiresAt: new Date('2026-06-01T11:00:00Z') });
      expect(() => BookingLifecyclePolicy.assertCanCheckout(b, now)).toThrow(/expirou/);
    });
  });

  describe('assertCanConfirmPayment', () => {
    it('allows confirming from PAYMENT_PENDING', () => {
      const b = booking({ status: BookingStatus.PAYMENT_PENDING });
      expect(() => BookingLifecyclePolicy.assertCanConfirmPayment(b)).not.toThrow();
    });

    it('is idempotent: does not throw when already CONFIRMED', () => {
      const b = booking({ status: BookingStatus.CONFIRMED });
      expect(() => BookingLifecyclePolicy.assertCanConfirmPayment(b)).not.toThrow();
    });

    it('rejects confirming from HELD (must go through checkout first)', () => {
      const b = booking({ status: BookingStatus.HELD });
      expect(() => BookingLifecyclePolicy.assertCanConfirmPayment(b)).toThrow(ConflictException);
    });

    it.each([BookingStatus.CANCELLED, BookingStatus.EXPIRED])('rejects confirming a %s booking', (status) => {
      const b = booking({ status });
      expect(() => BookingLifecyclePolicy.assertCanConfirmPayment(b)).toThrow(ConflictException);
    });
  });

  describe('assertCanCancel', () => {
    it.each([BookingStatus.HELD, BookingStatus.PAYMENT_PENDING, BookingStatus.CONFIRMED])(
      'allows cancelling a %s booking',
      (status) => {
        expect(() => BookingLifecyclePolicy.assertCanCancel(booking({ status }))).not.toThrow();
      },
    );

    it.each([BookingStatus.CANCELLED, BookingStatus.EXPIRED, BookingStatus.COMPLETED, BookingStatus.REFUNDED])(
      'rejects cancelling an already-%s booking',
      (status) => {
        expect(() => BookingLifecyclePolicy.assertCanCancel(booking({ status }))).toThrow(ConflictException);
      },
    );
  });

  describe('assertCanRelease', () => {
    it('allows releasing a HELD booking', () => {
      expect(() => BookingLifecyclePolicy.assertCanRelease(booking({ status: BookingStatus.HELD }))).not.toThrow();
    });

    it('rejects releasing a PAYMENT_PENDING booking, pointing to cancel instead', () => {
      const b = booking({ status: BookingStatus.PAYMENT_PENDING });
      expect(() => BookingLifecyclePolicy.assertCanRelease(b)).toThrow(/cancelamento/);
    });

    it('rejects releasing a CONFIRMED booking, pointing to cancel instead', () => {
      const b = booking({ status: BookingStatus.CONFIRMED });
      expect(() => BookingLifecyclePolicy.assertCanRelease(b)).toThrow(/cancelamento/);
    });

    it('rejects releasing an already-CANCELLED booking', () => {
      expect(() => BookingLifecyclePolicy.assertCanRelease(booking({ status: BookingStatus.CANCELLED }))).toThrow(
        ConflictException,
      );
    });
  });
});
