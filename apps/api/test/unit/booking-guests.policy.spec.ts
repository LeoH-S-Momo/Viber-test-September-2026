import { BadRequestException } from '@nestjs/common';
import { BookingGuestsPolicy, type GuestInput } from '../../src/modules/bookings/domain/booking-guests.policy';

function guests(primaryCount: number, total: number): GuestInput[] {
  return Array.from({ length: total }, (_, i) => ({ isPrimary: i < primaryCount }));
}

describe('BookingGuestsPolicy', () => {
  describe('assertValidGuestList', () => {
    it('accepts a list with exactly one primary guest, within capacity', () => {
      expect(() => BookingGuestsPolicy.assertValidGuestList(guests(1, 2), 4)).not.toThrow();
    });

    it('rejects an empty guest list', () => {
      expect(() => BookingGuestsPolicy.assertValidGuestList([], 4)).toThrow(BadRequestException);
    });

    it('rejects more guests than the cabin category allows', () => {
      expect(() => BookingGuestsPolicy.assertValidGuestList(guests(1, 5), 4)).toThrow(/maximo 4/);
    });

    it('accepts a guest count exactly at capacity', () => {
      expect(() => BookingGuestsPolicy.assertValidGuestList(guests(1, 4), 4)).not.toThrow();
    });

    it('rejects zero primary guests', () => {
      expect(() => BookingGuestsPolicy.assertValidGuestList(guests(0, 2), 4)).toThrow(/titular/);
    });

    it('rejects more than one primary guest', () => {
      expect(() => BookingGuestsPolicy.assertValidGuestList(guests(2, 3), 4)).toThrow(/titular/);
    });
  });
});
