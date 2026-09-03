import { ConflictException, NotFoundException } from '@nestjs/common';
import { BookingStatus, CabinStatus, CruiseStatus } from '@prisma/client';

// @nestjs/bullmq ships ESM-only JS in node_modules, which ts-jest's default
// config (transform only .ts, node_modules untransformed) cant parse. So
// esta suite so precisa da assinatura do decorator, nao do comportamento
// real de DI (o teste instancia BookingsService com `new`, nao via Nest) —
// mockar evita puxar o pacote real so pra rodar `jest`.
jest.mock('@nestjs/bullmq', () => ({
  InjectQueue:
    () =>
    (): void => {
      /* no-op: nao usamos o container de DI do Nest neste teste */
    },
}));

import { BookingsService } from '../../src/modules/bookings/application/bookings.service';

function buildService() {
  const bookingsRepository = {
    findMine: jest.fn(),
    findCabinStatus: jest.fn(),
    findActiveBookingPlain: jest.fn(),
    findCruiseStatus: jest.fn(),
    findCruiseBySlug: jest.fn(),
    lockCabinForUpdate: jest.fn(),
    lockBookingForUpdate: jest.fn(),
    expireStaleHold: jest.fn(),
    findActiveBooking: jest.fn(),
    findCruiseCabinPricing: jest.fn(),
    createHold: jest.fn(),
    updateStatus: jest.fn(),
  };
  const prisma = { $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback({})) };
  const configService = { getOrThrow: jest.fn().mockReturnValue(15) };
  const queue = { add: jest.fn(), remove: jest.fn() };

  const service = new BookingsService(
    prisma as never,
    bookingsRepository as never,
    configService as never,
    queue as never,
  );

  return { service, bookingsRepository, prisma, configService, queue };
}

const PUBLISHED_CRUISE = { id: 'cruise-1', status: CruiseStatus.PUBLISHED };

describe('BookingsService', () => {
  describe('holdCabin', () => {
    it('throws NotFoundException before opening a transaction when the cruise is not published', async () => {
      const { service, bookingsRepository, prisma } = buildService();
      bookingsRepository.findCruiseBySlug.mockResolvedValue({ id: 'c1', status: CruiseStatus.DRAFT });

      await expect(service.holdCabin('user-1', 'draft-cruise', 'cabin-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the cabin does not exist', async () => {
      const { service, bookingsRepository } = buildService();
      bookingsRepository.findCruiseBySlug.mockResolvedValue(PUBLISHED_CRUISE);
      bookingsRepository.lockCabinForUpdate.mockResolvedValue(null);

      await expect(service.holdCabin('user-1', 'slug', 'cabin-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(bookingsRepository.createHold).not.toHaveBeenCalled();
    });

    it('rejects a cabin that is not ACTIVE (e.g. under maintenance)', async () => {
      const { service, bookingsRepository } = buildService();
      bookingsRepository.findCruiseBySlug.mockResolvedValue(PUBLISHED_CRUISE);
      bookingsRepository.lockCabinForUpdate.mockResolvedValue({
        id: 'cabin-1',
        status: CabinStatus.MAINTENANCE,
        cabinCategoryId: 'cat-1',
      });

      await expect(service.holdCabin('user-1', 'slug', 'cabin-1')).rejects.toBeInstanceOf(ConflictException);
      expect(bookingsRepository.createHold).not.toHaveBeenCalled();
    });

    it('rejects when an active booking already exists for this cabin+cruise', async () => {
      const { service, bookingsRepository } = buildService();
      bookingsRepository.findCruiseBySlug.mockResolvedValue(PUBLISHED_CRUISE);
      bookingsRepository.lockCabinForUpdate.mockResolvedValue({
        id: 'cabin-1',
        status: CabinStatus.ACTIVE,
        cabinCategoryId: 'cat-1',
      });
      bookingsRepository.findActiveBooking.mockResolvedValue({ id: 'other-booking' });

      await expect(service.holdCabin('user-1', 'slug', 'cabin-1')).rejects.toBeInstanceOf(ConflictException);
      expect(bookingsRepository.createHold).not.toHaveBeenCalled();
    });

    it('rejects when the cabin category has no pricing set for this cruise', async () => {
      const { service, bookingsRepository } = buildService();
      bookingsRepository.findCruiseBySlug.mockResolvedValue(PUBLISHED_CRUISE);
      bookingsRepository.lockCabinForUpdate.mockResolvedValue({
        id: 'cabin-1',
        status: CabinStatus.ACTIVE,
        cabinCategoryId: 'cat-1',
      });
      bookingsRepository.findActiveBooking.mockResolvedValue(null);
      bookingsRepository.findCruiseCabinPricing.mockResolvedValue(null);

      await expect(service.holdCabin('user-1', 'slug', 'cabin-1')).rejects.toBeInstanceOf(ConflictException);
      expect(bookingsRepository.createHold).not.toHaveBeenCalled();
    });

    it('always expires stale holds for this cabin+cruise before checking for an active booking', async () => {
      const { service, bookingsRepository } = buildService();
      bookingsRepository.findCruiseBySlug.mockResolvedValue(PUBLISHED_CRUISE);
      bookingsRepository.lockCabinForUpdate.mockResolvedValue({
        id: 'cabin-1',
        status: CabinStatus.ACTIVE,
        cabinCategoryId: 'cat-1',
      });
      bookingsRepository.findActiveBooking.mockResolvedValue(null);
      bookingsRepository.findCruiseCabinPricing.mockResolvedValue({ price: '2200', currency: 'BRL' });
      bookingsRepository.createHold.mockResolvedValue({
        id: 'booking-1',
        holdExpiresAt: new Date(Date.now() + 15 * 60_000),
      });

      await service.holdCabin('user-1', 'slug', 'cabin-1');

      const [expireOrder] = bookingsRepository.expireStaleHold.mock.invocationCallOrder;
      const [activeCheckOrder] = bookingsRepository.findActiveBooking.mock.invocationCallOrder;
      expect(expireOrder).toBeDefined();
      expect(activeCheckOrder).toBeDefined();
      expect(expireOrder as number).toBeLessThan(activeCheckOrder as number);
    });

    it('creates the hold and schedules its expiration job with a matching jobId/delay', async () => {
      const { service, bookingsRepository, queue } = buildService();
      bookingsRepository.findCruiseBySlug.mockResolvedValue(PUBLISHED_CRUISE);
      bookingsRepository.lockCabinForUpdate.mockResolvedValue({
        id: 'cabin-1',
        status: CabinStatus.ACTIVE,
        cabinCategoryId: 'cat-1',
      });
      bookingsRepository.findActiveBooking.mockResolvedValue(null);
      bookingsRepository.findCruiseCabinPricing.mockResolvedValue({ price: '2200', currency: 'BRL' });
      const holdExpiresAt = new Date(Date.now() + 15 * 60_000);
      bookingsRepository.createHold.mockResolvedValue({ id: 'booking-1', holdExpiresAt });

      const booking = await service.holdCabin('user-1', 'slug', 'cabin-1');

      expect(booking.id).toBe('booking-1');
      expect(queue.add).toHaveBeenCalledWith(
        expect.any(String),
        { bookingId: 'booking-1' },
        expect.objectContaining({ jobId: 'booking-1' }),
      );
    });

    it('does not let a Redis/queue failure fail the hold itself (already committed to Postgres)', async () => {
      const { service, bookingsRepository, queue } = buildService();
      bookingsRepository.findCruiseBySlug.mockResolvedValue(PUBLISHED_CRUISE);
      bookingsRepository.lockCabinForUpdate.mockResolvedValue({
        id: 'cabin-1',
        status: CabinStatus.ACTIVE,
        cabinCategoryId: 'cat-1',
      });
      bookingsRepository.findActiveBooking.mockResolvedValue(null);
      bookingsRepository.findCruiseCabinPricing.mockResolvedValue({ price: '2200', currency: 'BRL' });
      bookingsRepository.createHold.mockResolvedValue({
        id: 'booking-1',
        holdExpiresAt: new Date(Date.now() + 15 * 60_000),
      });
      queue.add.mockRejectedValue(new Error('Redis indisponivel'));

      await expect(service.holdCabin('user-1', 'slug', 'cabin-1')).resolves.toMatchObject({ id: 'booking-1' });
    });
  });

  describe('confirmBooking', () => {
    it('confirms a HELD booking owned by the caller and cancels its scheduled expiration job', async () => {
      const { service, bookingsRepository, queue } = buildService();
      bookingsRepository.lockBookingForUpdate.mockResolvedValue({
        id: 'booking-1',
        userId: 'user-1',
        status: BookingStatus.HELD,
        holdExpiresAt: new Date(Date.now() + 60_000),
      });
      bookingsRepository.updateStatus.mockResolvedValue({ id: 'booking-1', status: BookingStatus.CONFIRMED });

      const result = await service.confirmBooking('booking-1', 'user-1');

      expect(result.status).toBe(BookingStatus.CONFIRMED);
      expect(queue.remove).toHaveBeenCalledWith('booking-1');
    });

    it('rejects confirming someone else\'s booking with NotFoundException', async () => {
      const { service, bookingsRepository } = buildService();
      bookingsRepository.lockBookingForUpdate.mockResolvedValue({
        id: 'booking-1',
        userId: 'owner',
        status: BookingStatus.HELD,
        holdExpiresAt: new Date(Date.now() + 60_000),
      });

      await expect(service.confirmBooking('booking-1', 'someone-else')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(bookingsRepository.updateStatus).not.toHaveBeenCalled();
    });

    it('rejects confirming an already-expired hold', async () => {
      const { service, bookingsRepository } = buildService();
      bookingsRepository.lockBookingForUpdate.mockResolvedValue({
        id: 'booking-1',
        userId: 'user-1',
        status: BookingStatus.HELD,
        holdExpiresAt: new Date(Date.now() - 60_000),
      });

      await expect(service.confirmBooking('booking-1', 'user-1')).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('releaseHold', () => {
    it('rejects releasing a CONFIRMED booking (must use cancel instead)', async () => {
      const { service, bookingsRepository } = buildService();
      bookingsRepository.lockBookingForUpdate.mockResolvedValue({
        id: 'booking-1',
        userId: 'user-1',
        status: BookingStatus.CONFIRMED,
        holdExpiresAt: null,
      });

      await expect(service.releaseHold('booking-1', 'user-1')).rejects.toBeInstanceOf(ConflictException);
      expect(bookingsRepository.updateStatus).not.toHaveBeenCalled();
    });
  });

  describe('expireHoldIfStillPending', () => {
    it('cancels a HELD booking whose hold has actually expired', async () => {
      const { service, bookingsRepository } = buildService();
      bookingsRepository.lockBookingForUpdate.mockResolvedValue({
        id: 'booking-1',
        userId: 'user-1',
        status: BookingStatus.HELD,
        holdExpiresAt: new Date(Date.now() - 60_000),
      });

      await service.expireHoldIfStillPending('booking-1');

      expect(bookingsRepository.updateStatus).toHaveBeenCalledWith(
        expect.anything(),
        'booking-1',
        expect.objectContaining({ status: 'CANCELLED' }),
      );
    });

    it('does nothing when the booking was already confirmed before the job fired', async () => {
      const { service, bookingsRepository } = buildService();
      bookingsRepository.lockBookingForUpdate.mockResolvedValue({
        id: 'booking-1',
        userId: 'user-1',
        status: BookingStatus.CONFIRMED,
        holdExpiresAt: new Date(Date.now() - 60_000),
      });

      await service.expireHoldIfStillPending('booking-1');

      expect(bookingsRepository.updateStatus).not.toHaveBeenCalled();
    });

    it('does nothing when the booking no longer exists', async () => {
      const { service, bookingsRepository } = buildService();
      bookingsRepository.lockBookingForUpdate.mockResolvedValue(null);

      await service.expireHoldIfStillPending('booking-1');

      expect(bookingsRepository.updateStatus).not.toHaveBeenCalled();
    });

    it('does nothing when called early, before the hold has actually expired (defensive re-check)', async () => {
      const { service, bookingsRepository } = buildService();
      bookingsRepository.lockBookingForUpdate.mockResolvedValue({
        id: 'booking-1',
        userId: 'user-1',
        status: BookingStatus.HELD,
        holdExpiresAt: new Date(Date.now() + 60_000),
      });

      await service.expireHoldIfStillPending('booking-1');

      expect(bookingsRepository.updateStatus).not.toHaveBeenCalled();
    });
  });
});
