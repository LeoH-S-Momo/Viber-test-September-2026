import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { RoleKey } from '@prisma/client';
import { ActivitiesService } from '../../src/modules/activities/application/activities.service';

const CONFIRMED_BOOKING = {
  id: 'booking-1',
  cruiseId: 'cruise-1',
  cruise: {
    embarkationDate: new Date('2027-03-10T00:00:00.000Z'),
    disembarkationDate: new Date('2027-03-17T00:00:00.000Z'),
    shipId: 'ship-1',
  },
};

const EVENT = {
  id: 'event-1',
  cruiseId: 'cruise-1',
  capacity: 10,
  startAt: new Date('2027-03-12T20:00:00.000Z'),
  endAt: new Date('2027-03-12T22:00:00.000Z'),
  title: 'Show de abertura',
};

const DINING_SLOT = {
  id: 'slot-1',
  restaurantId: 'restaurant-1',
  capacity: 20,
  startTime: new Date('1970-01-01T19:00:00.000Z'),
  endTime: new Date('1970-01-01T21:00:00.000Z'),
  label: 'Primeiro turno',
};

const RESTAURANT = { id: 'restaurant-1', name: 'Salao Azul', shipId: 'ship-1' };

function buildService() {
  const activitiesRepository = {
    findConfirmedBookingForUser: jest.fn().mockResolvedValue(CONFIRMED_BOOKING),
    findBookingTimeWindows: jest.fn().mockResolvedValue([]),
    lockEventForUpdate: jest.fn().mockResolvedValue(EVENT),
    sumActiveEventPartySize: jest.fn().mockResolvedValue(0),
    findEventReservation: jest.fn().mockResolvedValue(null),
    upsertEventReservation: jest.fn().mockImplementation((_tx, params) => Promise.resolve({ id: 'ev-res-1', status: 'CONFIRMED', ...params })),
    cancelEventReservation: jest.fn(),
    findEventReservationById: jest.fn(),
    listMyEventReservations: jest.fn(),
    lockDiningSlotForUpdate: jest.fn().mockResolvedValue(DINING_SLOT),
    findDiningSlotWithRestaurant: jest.fn().mockResolvedValue({ ...DINING_SLOT, restaurant: RESTAURANT }),
    sumActiveDiningPartySize: jest.fn().mockResolvedValue(0),
    findDiningReservation: jest.fn().mockResolvedValue(null),
    upsertDiningReservation: jest.fn().mockImplementation((_tx, params) => Promise.resolve({ id: 'dn-res-1', status: 'CONFIRMED', ...params })),
    cancelDiningReservation: jest.fn(),
    findDiningReservationById: jest.fn(),
    listMyDiningReservations: jest.fn(),
    createDiningSlot: jest.fn(),
    updateDiningSlot: jest.fn(),
    findDiningSlotForOwnership: jest.fn(),
  };

  const tx = {};
  const prisma = {
    $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(tx)),
    restaurant: { findUnique: jest.fn() },
    ship: { findUnique: jest.fn() },
  };

  const service = new ActivitiesService(prisma as never, activitiesRepository as never);
  return { service, activitiesRepository, prisma };
}

describe('ActivitiesService', () => {
  describe('reserveEvent', () => {
    it('reserves an event when there is capacity and no schedule conflict', async () => {
      const { service, activitiesRepository } = buildService();
      const result = await service.reserveEvent('user-1', 'booking-1', 'event-1', 2);
      expect(activitiesRepository.upsertEventReservation).toHaveBeenCalledWith(expect.anything(), {
        eventId: 'event-1',
        bookingId: 'booking-1',
        partySize: 2,
      });
      expect(result).toMatchObject({ status: 'CONFIRMED' });
    });

    it('404 when the booking is not owned by this user or not confirmed', async () => {
      const { service, activitiesRepository } = buildService();
      activitiesRepository.findConfirmedBookingForUser.mockResolvedValue(null);
      await expect(service.reserveEvent('user-1', 'booking-1', 'event-1', 2)).rejects.toBeInstanceOf(NotFoundException);
      expect(activitiesRepository.lockEventForUpdate).not.toHaveBeenCalled();
    });

    it('rejects when the event belongs to a different cruise than the booking', async () => {
      const { service, activitiesRepository } = buildService();
      activitiesRepository.lockEventForUpdate.mockResolvedValue({ ...EVENT, cruiseId: 'cruise-outro' });
      await expect(service.reserveEvent('user-1', 'booking-1', 'event-1', 2)).rejects.toBeInstanceOf(ConflictException);
      expect(activitiesRepository.upsertEventReservation).not.toHaveBeenCalled();
    });

    it('rejects when party size exceeds remaining capacity', async () => {
      const { service, activitiesRepository } = buildService();
      activitiesRepository.sumActiveEventPartySize.mockResolvedValue(9);
      await expect(service.reserveEvent('user-1', 'booking-1', 'event-1', 5)).rejects.toBeInstanceOf(ConflictException);
      expect(activitiesRepository.upsertEventReservation).not.toHaveBeenCalled();
    });

    it('rejects when the event overlaps another activity already on the booking', async () => {
      const { service, activitiesRepository } = buildService();
      activitiesRepository.findBookingTimeWindows.mockResolvedValue([
        { start: new Date('2027-03-12T19:30:00.000Z'), end: new Date('2027-03-12T21:00:00.000Z'), label: 'Jantar' },
      ]);
      await expect(service.reserveEvent('user-1', 'booking-1', 'event-1', 2)).rejects.toBeInstanceOf(ConflictException);
      expect(activitiesRepository.upsertEventReservation).not.toHaveBeenCalled();
    });

    it('is an idempotent no-op retry when the same booking already confirmed the same party size', async () => {
      const { service, activitiesRepository } = buildService();
      const existing = { id: 'ev-res-1', status: 'CONFIRMED', partySize: 2 };
      activitiesRepository.findEventReservation.mockResolvedValue(existing);
      const result = await service.reserveEvent('user-1', 'booking-1', 'event-1', 2);
      expect(result).toBe(existing);
      expect(activitiesRepository.upsertEventReservation).not.toHaveBeenCalled();
    });

    it('rejects changing party size on an existing confirmed reservation (must cancel first)', async () => {
      const { service, activitiesRepository } = buildService();
      activitiesRepository.findEventReservation.mockResolvedValue({ id: 'ev-res-1', status: 'CONFIRMED', partySize: 2 });
      await expect(service.reserveEvent('user-1', 'booking-1', 'event-1', 3)).rejects.toBeInstanceOf(ConflictException);
      expect(activitiesRepository.upsertEventReservation).not.toHaveBeenCalled();
    });
  });

  describe('reserveDining', () => {
    const reservationDate = new Date('2027-03-13T00:00:00.000Z');

    it('reserves a dining slot when there is capacity, no conflict, and the date is within the cruise', async () => {
      const { service, activitiesRepository } = buildService();
      const result = await service.reserveDining('user-1', 'booking-1', 'slot-1', 4, reservationDate);
      expect(activitiesRepository.upsertDiningReservation).toHaveBeenCalledWith(expect.anything(), {
        diningSlotId: 'slot-1',
        bookingId: 'booking-1',
        partySize: 4,
        reservationDate,
      });
      expect(result).toMatchObject({ status: 'CONFIRMED' });
    });

    it('rejects a reservation date outside the cruise period', async () => {
      const { service, activitiesRepository } = buildService();
      const outside = new Date('2027-04-01T00:00:00.000Z');
      await expect(service.reserveDining('user-1', 'booking-1', 'slot-1', 2, outside)).rejects.toBeInstanceOf(ConflictException);
      expect(activitiesRepository.upsertDiningReservation).not.toHaveBeenCalled();
    });

    it('rejects when the restaurant does not belong to the booking cruise ship', async () => {
      const { service, activitiesRepository } = buildService();
      activitiesRepository.findDiningSlotWithRestaurant.mockResolvedValue({
        ...DINING_SLOT,
        restaurant: { ...RESTAURANT, shipId: 'ship-outro' },
      });
      await expect(service.reserveDining('user-1', 'booking-1', 'slot-1', 2, reservationDate)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rejects when party size exceeds remaining capacity for that date', async () => {
      const { service, activitiesRepository } = buildService();
      activitiesRepository.sumActiveDiningPartySize.mockResolvedValue(19);
      await expect(service.reserveDining('user-1', 'booking-1', 'slot-1', 3, reservationDate)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rejects a dining slot that overlaps an already-reserved event', async () => {
      const { service, activitiesRepository } = buildService();
      activitiesRepository.findBookingTimeWindows.mockResolvedValue([
        { start: new Date('2027-03-13T19:30:00.000Z'), end: new Date('2027-03-13T20:30:00.000Z'), label: 'Show' },
      ]);
      await expect(service.reserveDining('user-1', 'booking-1', 'slot-1', 2, reservationDate)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('cancelEventReservation / cancelDiningReservation', () => {
    it('cancels an owned confirmed event reservation', async () => {
      const { service, activitiesRepository } = buildService();
      activitiesRepository.findEventReservationById.mockResolvedValue({ id: 'ev-res-1', bookingId: 'booking-1', status: 'CONFIRMED' });
      activitiesRepository.cancelEventReservation.mockResolvedValue({ id: 'ev-res-1', status: 'CANCELLED' });
      const result = await service.cancelEventReservation('user-1', 'booking-1', 'ev-res-1');
      expect(result).toMatchObject({ status: 'CANCELLED' });
    });

    it('404 when the reservation belongs to a different booking', async () => {
      const { service, activitiesRepository } = buildService();
      activitiesRepository.findEventReservationById.mockResolvedValue({ id: 'ev-res-1', bookingId: 'booking-outro', status: 'CONFIRMED' });
      await expect(service.cancelEventReservation('user-1', 'booking-1', 'ev-res-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('cancelling twice is idempotent (no-op on an already-cancelled reservation)', async () => {
      const { service, activitiesRepository } = buildService();
      const cancelled = { id: 'ev-res-1', bookingId: 'booking-1', status: 'CANCELLED' };
      activitiesRepository.findEventReservationById.mockResolvedValue(cancelled);
      const result = await service.cancelEventReservation('user-1', 'booking-1', 'ev-res-1');
      expect(result).toBe(cancelled);
      expect(activitiesRepository.cancelEventReservation).not.toHaveBeenCalled();
    });
  });

  describe('createDiningSlot (organizer)', () => {
    const ORGANIZER_USER = {
      sub: 'organizer-user-1',
      roles: [{ key: RoleKey.ORGANIZER_ADMIN, organizerId: 'org-1' }],
    };

    it('creates a slot when the organizer owns the ship behind the restaurant', async () => {
      const { service, activitiesRepository, prisma } = buildService();
      (prisma.restaurant.findUnique as jest.Mock).mockResolvedValue({ shipId: 'ship-1' });
      (prisma.ship.findUnique as jest.Mock).mockResolvedValue({ organizerId: 'org-1' });
      activitiesRepository.createDiningSlot.mockResolvedValue({ id: 'slot-new' });

      const result = await service.createDiningSlot(ORGANIZER_USER as never, 'restaurant-1', {
        label: 'Jantar',
        startTime: new Date(),
        endTime: new Date(),
        capacity: 30,
      });
      expect(result).toEqual({ id: 'slot-new' });
    });

    it('forbids creating a slot for a restaurant on a ship owned by another organizer', async () => {
      const { service, prisma } = buildService();
      (prisma.restaurant.findUnique as jest.Mock).mockResolvedValue({ shipId: 'ship-1' });
      (prisma.ship.findUnique as jest.Mock).mockResolvedValue({ organizerId: 'org-outro' });

      await expect(
        service.createDiningSlot(ORGANIZER_USER as never, 'restaurant-1', {
          label: 'Jantar',
          startTime: new Date(),
          endTime: new Date(),
          capacity: 30,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
