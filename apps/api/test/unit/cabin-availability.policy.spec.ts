import { BookingStatus, CabinStatus } from '@prisma/client';
import { CabinAvailabilityPolicy } from '../../src/modules/catalog/domain/cabin-availability.policy';

describe('CabinAvailabilityPolicy', () => {
  describe('resolve', () => {
    it('is AVAILABLE for an ACTIVE cabin with no booking', () => {
      expect(CabinAvailabilityPolicy.resolve(CabinStatus.ACTIVE, undefined)).toBe('AVAILABLE');
    });

    it.each([CabinStatus.MAINTENANCE, CabinStatus.RETIRED])(
      'is UNAVAILABLE for a %s cabin, even with no booking',
      (status) => {
        expect(CabinAvailabilityPolicy.resolve(status, undefined)).toBe('UNAVAILABLE');
      },
    );

    it('is UNAVAILABLE for a non-ACTIVE cabin even if it also has an active booking', () => {
      const booking = { status: BookingStatus.CONFIRMED, holdExpiresAt: null };
      expect(CabinAvailabilityPolicy.resolve(CabinStatus.MAINTENANCE, booking)).toBe('UNAVAILABLE');
    });

    it('is BOOKED for a CONFIRMED booking', () => {
      const booking = { status: BookingStatus.CONFIRMED, holdExpiresAt: null };
      expect(CabinAvailabilityPolicy.resolve(CabinStatus.ACTIVE, booking)).toBe('BOOKED');
    });

    it('is ON_HOLD for a PENDING booking whose hold has not expired yet', () => {
      const now = new Date('2026-06-01T12:00:00Z');
      const booking = { status: BookingStatus.PENDING, holdExpiresAt: new Date('2026-06-01T12:10:00Z') };
      expect(CabinAvailabilityPolicy.resolve(CabinStatus.ACTIVE, booking, now)).toBe('ON_HOLD');
    });

    it('is AVAILABLE again for a PENDING booking whose hold already expired', () => {
      const now = new Date('2026-06-01T12:00:00Z');
      const booking = { status: BookingStatus.PENDING, holdExpiresAt: new Date('2026-06-01T11:50:00Z') };
      expect(CabinAvailabilityPolicy.resolve(CabinStatus.ACTIVE, booking, now)).toBe('AVAILABLE');
    });

    it('is ON_HOLD for a PENDING booking with no holdExpiresAt set', () => {
      const booking = { status: BookingStatus.PENDING, holdExpiresAt: null };
      expect(CabinAvailabilityPolicy.resolve(CabinStatus.ACTIVE, booking)).toBe('ON_HOLD');
    });
  });
});
