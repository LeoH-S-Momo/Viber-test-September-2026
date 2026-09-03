import { ConflictException, NotFoundException } from '@nestjs/common';
import { BookingStatus, CabinStatus, CouponDiscountType, CruiseStatus, Prisma } from '@prisma/client';

// @nestjs/bullmq ships ESM-only JS in node_modules, que ts-jest (transform
// so .ts, node_modules intransformado) nao consegue parsear. Esta suite so
// precisa da assinatura do decorator, nao do comportamento real de DI (o
// teste instancia BookingsService com `new`, nao via Nest).
jest.mock('@nestjs/bullmq', () => ({
  InjectQueue:
    () =>
    (): void => {
      /* no-op: nao usamos o container de DI do Nest neste teste */
    },
}));

import { BookingsService } from '../../src/modules/bookings/application/bookings.service';

const PUBLISHED_CRUISE = { id: 'cruise-1', status: CruiseStatus.PUBLISHED };
const ACTIVE_CABIN = { id: 'cabin-1', status: CabinStatus.ACTIVE, cabinCategoryId: 'cat-1' };
const PRICING = { price: new Prisma.Decimal(2000), currency: 'BRL' };

function buildService() {
  const bookingsRepository = {
    findMine: jest.fn(),
    findByIdForUser: jest.fn(),
    findByIdempotencyKey: jest.fn(),
    findCabinStatus: jest.fn(),
    findCabinWithCategory: jest.fn(),
    findActiveBookingPlain: jest.fn(),
    findCruiseStatus: jest.fn(),
    findCruiseBySlug: jest.fn(),
    findExperiencesByIds: jest.fn().mockResolvedValue([]),
    findCouponByCode: jest.fn(),
    countUserCouponUsage: jest.fn().mockResolvedValue(0),
    lockCabinForUpdate: jest.fn(),
    lockBookingForUpdate: jest.fn(),
    lockCouponForUpdate: jest.fn(),
    incrementCouponUsage: jest.fn(),
    expireStaleHold: jest.fn(),
    findActiveBooking: jest.fn(),
    findCruiseCabinPricing: jest.fn(),
    createHold: jest.fn(),
    updateStatus: jest.fn(),
    replaceGuestsAndExperiences: jest.fn(),
    createPayment: jest.fn(),
    findPendingPayment: jest.fn(),
    approvePayment: jest.fn(),
  };

  const tx = {
    booking: { findUniqueOrThrow: jest.fn() },
    bookingGuest: { count: jest.fn().mockResolvedValue(1) },
  };
  const prisma = { $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(tx)) };
  const configService = { getOrThrow: jest.fn().mockReturnValue(15) };
  const queue = { add: jest.fn(), remove: jest.fn() };

  const service = new BookingsService(
    prisma as never,
    bookingsRepository as never,
    configService as never,
    queue as never,
  );

  return { service, bookingsRepository, prisma, tx, configService, queue };
}

describe('BookingsService', () => {
  describe('holdCabin', () => {
    it('short-circuits (never opens a transaction) when the idempotency key already resolved to a booking', async () => {
      const { service, bookingsRepository, prisma } = buildService();
      const existing = { id: 'booking-existing' };
      bookingsRepository.findByIdempotencyKey.mockResolvedValue(existing);

      const result = await service.holdCabin('user-1', 'slug', 'cabin-1', 'key-123');

      expect(result).toBe(existing);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(bookingsRepository.findCruiseBySlug).not.toHaveBeenCalled();
    });

    it('creates a fresh hold with a full pricing breakdown when nothing blocks it', async () => {
      const { service, bookingsRepository, queue } = buildService();
      bookingsRepository.findByIdempotencyKey.mockResolvedValue(null);
      bookingsRepository.findCruiseBySlug.mockResolvedValue(PUBLISHED_CRUISE);
      bookingsRepository.lockCabinForUpdate.mockResolvedValue(ACTIVE_CABIN);
      bookingsRepository.findActiveBooking.mockResolvedValue(null);
      bookingsRepository.findCruiseCabinPricing.mockResolvedValue(PRICING);
      bookingsRepository.createHold.mockResolvedValue({
        id: 'booking-1',
        holdExpiresAt: new Date(Date.now() + 15 * 60_000),
      });

      await service.holdCabin('user-1', 'slug', 'cabin-1', 'key-123');

      expect(bookingsRepository.createHold).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          userId: 'user-1',
          cruiseId: 'cruise-1',
          cabinId: 'cabin-1',
          idempotencyKey: 'key-123',
          subtotalAmount: expect.any(Prisma.Decimal),
          totalAmount: expect.any(Prisma.Decimal),
        }),
      );
      expect(queue.add).toHaveBeenCalledWith(expect.any(String), { bookingId: 'booking-1' }, expect.objectContaining({ jobId: 'booking-1' }));
    });

    it('returns the concurrently-created booking instead of throwing when it is the caller\'s own idempotent retry', async () => {
      const { service, bookingsRepository } = buildService();
      bookingsRepository.findByIdempotencyKey.mockResolvedValue(null); // ainda nao commitado quando este request checou
      bookingsRepository.findCruiseBySlug.mockResolvedValue(PUBLISHED_CRUISE);
      bookingsRepository.lockCabinForUpdate.mockResolvedValue(ACTIVE_CABIN);
      const raceWinner = { id: 'booking-1', userId: 'user-1', idempotencyKey: 'key-123' };
      bookingsRepository.findActiveBooking.mockResolvedValue(raceWinner);

      const result = await service.holdCabin('user-1', 'slug', 'cabin-1', 'key-123');

      expect(result).toBe(raceWinner);
      expect(bookingsRepository.createHold).not.toHaveBeenCalled();
    });

    it('rejects when the active booking belongs to a different attempt (no matching idempotency key)', async () => {
      const { service, bookingsRepository } = buildService();
      bookingsRepository.findByIdempotencyKey.mockResolvedValue(null);
      bookingsRepository.findCruiseBySlug.mockResolvedValue(PUBLISHED_CRUISE);
      bookingsRepository.lockCabinForUpdate.mockResolvedValue(ACTIVE_CABIN);
      bookingsRepository.findActiveBooking.mockResolvedValue({ id: 'other', userId: 'user-2', idempotencyKey: null });

      await expect(service.holdCabin('user-1', 'slug', 'cabin-1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a cabin that is not ACTIVE', async () => {
      const { service, bookingsRepository } = buildService();
      bookingsRepository.findCruiseBySlug.mockResolvedValue(PUBLISHED_CRUISE);
      bookingsRepository.lockCabinForUpdate.mockResolvedValue({ ...ACTIVE_CABIN, status: CabinStatus.MAINTENANCE });

      await expect(service.holdCabin('user-1', 'slug', 'cabin-1')).rejects.toBeInstanceOf(ConflictException);
      expect(bookingsRepository.createHold).not.toHaveBeenCalled();
    });
  });

  describe('updateDetails', () => {
    const HELD_BOOKING = { id: 'booking-1', userId: 'user-1', cruiseId: 'cruise-1', cabinId: 'cabin-1', status: BookingStatus.HELD, holdExpiresAt: new Date(Date.now() + 60_000) };

    it('validates guest capacity, resolves experiences/coupon, and replaces details with the recomputed price', async () => {
      const { service, bookingsRepository } = buildService();
      bookingsRepository.lockBookingForUpdate.mockResolvedValue(HELD_BOOKING);
      bookingsRepository.findCabinWithCategory.mockResolvedValue({
        id: 'cabin-1',
        cabinCategoryId: 'cat-1',
        cabinCategory: { maxOccupancy: 2 },
      });
      bookingsRepository.findExperiencesByIds.mockResolvedValue([
        { id: 'exp-1', price: new Prisma.Decimal(150), isIncluded: false },
      ]);
      bookingsRepository.findCruiseCabinPricing.mockResolvedValue(PRICING);
      bookingsRepository.replaceGuestsAndExperiences.mockResolvedValue({ id: 'booking-1' });

      const guests = [{ fullName: 'Ana', documentType: 'PASSPORT' as const, documentNumber: '123', isPrimary: true }];
      await service.updateDetails('booking-1', 'user-1', { guests, experienceIds: ['exp-1'] });

      expect(bookingsRepository.replaceGuestsAndExperiences).toHaveBeenCalledWith(
        expect.anything(),
        'booking-1',
        expect.objectContaining({
          guests,
          experiences: [{ experienceId: 'exp-1', priceAtBooking: expect.any(Prisma.Decimal) }],
          pricing: expect.objectContaining({ subtotalAmount: expect.any(Prisma.Decimal) }),
        }),
      );
    });

    it('rejects when a requested experience does not belong to this cruise', async () => {
      const { service, bookingsRepository } = buildService();
      bookingsRepository.lockBookingForUpdate.mockResolvedValue(HELD_BOOKING);
      bookingsRepository.findCabinWithCategory.mockResolvedValue({
        id: 'cabin-1',
        cabinCategoryId: 'cat-1',
        cabinCategory: { maxOccupancy: 2 },
      });
      bookingsRepository.findExperiencesByIds.mockResolvedValue([]); // nao achou nenhuma das pedidas

      const guests = [{ fullName: 'Ana', documentType: 'PASSPORT' as const, documentNumber: '123', isPrimary: true }];
      await expect(
        service.updateDetails('booking-1', 'user-1', { guests, experienceIds: ['exp-de-outro-cruzeiro'] }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(bookingsRepository.replaceGuestsAndExperiences).not.toHaveBeenCalled();
    });

    it('rejects an invalid coupon before touching guests/experiences', async () => {
      const { service, bookingsRepository } = buildService();
      bookingsRepository.lockBookingForUpdate.mockResolvedValue(HELD_BOOKING);
      bookingsRepository.findCabinWithCategory.mockResolvedValue({
        id: 'cabin-1',
        cabinCategoryId: 'cat-1',
        cabinCategory: { maxOccupancy: 2 },
      });
      bookingsRepository.findCruiseCabinPricing.mockResolvedValue(PRICING);
      bookingsRepository.findCouponByCode.mockResolvedValue({
        id: 'coupon-1',
        code: 'ESGOTADO',
        discountType: CouponDiscountType.PERCENTAGE,
        discountValue: new Prisma.Decimal(10),
        minPurchaseAmount: null,
        maxUses: 1,
        usedCount: 1, // ja esgotado
        maxUsesPerUser: null,
        validFrom: new Date('2020-01-01'),
        validUntil: new Date('2030-01-01'),
        isActive: true,
        applicableCruiseIds: [],
      });

      const guests = [{ fullName: 'Ana', documentType: 'PASSPORT' as const, documentNumber: '123', isPrimary: true }];
      await expect(
        service.updateDetails('booking-1', 'user-1', { guests, experienceIds: [], couponCode: 'ESGOTADO' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(bookingsRepository.replaceGuestsAndExperiences).not.toHaveBeenCalled();
    });
  });

  describe('checkout', () => {
    const HELD_BOOKING = { id: 'booking-1', userId: 'user-1', cruiseId: 'cruise-1', cabinId: 'cabin-1', status: BookingStatus.HELD, holdExpiresAt: new Date(Date.now() + 60_000) };

    it('moves HELD -> PAYMENT_PENDING and creates a simulated payment when guests are present', async () => {
      const { service, bookingsRepository, tx } = buildService();
      bookingsRepository.lockBookingForUpdate.mockResolvedValue(HELD_BOOKING);
      tx.bookingGuest.count.mockResolvedValue(1);
      tx.booking.findUniqueOrThrow.mockResolvedValue({ id: 'booking-1', totalAmount: new Prisma.Decimal(2100), currency: 'BRL' });

      await service.checkout('booking-1', 'user-1', 'CREDIT_CARD');

      expect(bookingsRepository.updateStatus).toHaveBeenCalledWith(expect.anything(), 'booking-1', {
        status: BookingStatus.PAYMENT_PENDING,
      });
      expect(bookingsRepository.createPayment).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ bookingId: 'booking-1', method: 'CREDIT_CARD' }),
      );
    });

    it('rejects checkout when there are no guests yet', async () => {
      const { service, bookingsRepository, tx } = buildService();
      bookingsRepository.lockBookingForUpdate.mockResolvedValue(HELD_BOOKING);
      tx.bookingGuest.count.mockResolvedValue(0);

      await expect(service.checkout('booking-1', 'user-1', 'CREDIT_CARD')).rejects.toBeInstanceOf(ConflictException);
      expect(bookingsRepository.createPayment).not.toHaveBeenCalled();
    });

    it('is idempotent: retrying checkout with the same method while PAYMENT_PENDING returns the current booking without a new payment', async () => {
      const { service, bookingsRepository, tx } = buildService();
      bookingsRepository.lockBookingForUpdate.mockResolvedValue({ ...HELD_BOOKING, status: BookingStatus.PAYMENT_PENDING });
      bookingsRepository.findPendingPayment.mockResolvedValue({ id: 'payment-1', method: 'CREDIT_CARD' });
      tx.booking.findUniqueOrThrow.mockResolvedValue({ id: 'booking-1', status: BookingStatus.PAYMENT_PENDING });

      const result = await service.checkout('booking-1', 'user-1', 'CREDIT_CARD');

      expect(result).toMatchObject({ id: 'booking-1' });
      expect(bookingsRepository.createPayment).not.toHaveBeenCalled();
      expect(bookingsRepository.updateStatus).not.toHaveBeenCalled();
    });

    it('rejects retrying checkout with a different payment method than the one already pending', async () => {
      const { service, bookingsRepository } = buildService();
      bookingsRepository.lockBookingForUpdate.mockResolvedValue({ ...HELD_BOOKING, status: BookingStatus.PAYMENT_PENDING });
      bookingsRepository.findPendingPayment.mockResolvedValue({ id: 'payment-1', method: 'PIX' });

      await expect(service.checkout('booking-1', 'user-1', 'CREDIT_CARD')).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('confirmPayment', () => {
    it('approves the pending payment and confirms the booking', async () => {
      const { service, bookingsRepository, tx } = buildService();
      const locked = { id: 'booking-1', userId: 'user-1', status: BookingStatus.PAYMENT_PENDING, holdExpiresAt: null };
      bookingsRepository.lockBookingForUpdate.mockResolvedValue(locked);
      tx.booking.findUniqueOrThrow.mockResolvedValue({ id: 'booking-1', status: BookingStatus.PAYMENT_PENDING, couponId: null });
      bookingsRepository.findPendingPayment.mockResolvedValue({ id: 'payment-1' });
      bookingsRepository.updateStatus.mockResolvedValue({ id: 'booking-1', status: BookingStatus.CONFIRMED });

      const result = await service.confirmPayment('booking-1', 'user-1');

      expect(bookingsRepository.approvePayment).toHaveBeenCalledWith(expect.anything(), 'payment-1', expect.any(Date));
      expect(result).toMatchObject({ status: BookingStatus.CONFIRMED });
    });

    it('is idempotent: does nothing (no double payment approval) when already CONFIRMED', async () => {
      const { service, bookingsRepository, tx } = buildService();
      const locked = { id: 'booking-1', userId: 'user-1', status: BookingStatus.CONFIRMED, holdExpiresAt: null };
      bookingsRepository.lockBookingForUpdate.mockResolvedValue(locked);
      tx.booking.findUniqueOrThrow.mockResolvedValue({ id: 'booking-1', status: BookingStatus.CONFIRMED, couponId: null });

      const result = await service.confirmPayment('booking-1', 'user-1');

      expect(result).toMatchObject({ status: BookingStatus.CONFIRMED });
      expect(bookingsRepository.approvePayment).not.toHaveBeenCalled();
      expect(bookingsRepository.updateStatus).not.toHaveBeenCalled();
    });

    it('increments coupon usage when the booking has one applied', async () => {
      const { service, bookingsRepository, tx } = buildService();
      const locked = { id: 'booking-1', userId: 'user-1', status: BookingStatus.PAYMENT_PENDING, holdExpiresAt: null };
      bookingsRepository.lockBookingForUpdate.mockResolvedValue(locked);
      tx.booking.findUniqueOrThrow.mockResolvedValue({ id: 'booking-1', status: BookingStatus.PAYMENT_PENDING, couponId: 'coupon-1' });
      bookingsRepository.findPendingPayment.mockResolvedValue({ id: 'payment-1' });
      bookingsRepository.lockCouponForUpdate.mockResolvedValue({ id: 'coupon-1' });
      bookingsRepository.updateStatus.mockResolvedValue({ id: 'booking-1', status: BookingStatus.CONFIRMED });

      await service.confirmPayment('booking-1', 'user-1');

      expect(bookingsRepository.incrementCouponUsage).toHaveBeenCalledWith(expect.anything(), 'coupon-1');
    });

    it('rejects confirming when there is no pending payment on file', async () => {
      const { service, bookingsRepository, tx } = buildService();
      const locked = { id: 'booking-1', userId: 'user-1', status: BookingStatus.PAYMENT_PENDING, holdExpiresAt: null };
      bookingsRepository.lockBookingForUpdate.mockResolvedValue(locked);
      tx.booking.findUniqueOrThrow.mockResolvedValue({ id: 'booking-1', status: BookingStatus.PAYMENT_PENDING, couponId: null });
      bookingsRepository.findPendingPayment.mockResolvedValue(null);

      await expect(service.confirmPayment('booking-1', 'user-1')).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('cancelBooking / releaseHold', () => {
    it('cancels a PAYMENT_PENDING booking (broader than release, which is HELD-only)', async () => {
      const { service, bookingsRepository } = buildService();
      bookingsRepository.lockBookingForUpdate.mockResolvedValue({
        id: 'booking-1',
        userId: 'user-1',
        status: BookingStatus.PAYMENT_PENDING,
        holdExpiresAt: null,
      });
      bookingsRepository.updateStatus.mockResolvedValue({ id: 'booking-1', status: BookingStatus.CANCELLED });

      await service.cancelBooking('booking-1', 'user-1', 'mudei de ideia');

      expect(bookingsRepository.updateStatus).toHaveBeenCalledWith(
        expect.anything(),
        'booking-1',
        expect.objectContaining({ status: BookingStatus.CANCELLED, cancellationReason: 'mudei de ideia' }),
      );
    });

    it('rejects releasing a PAYMENT_PENDING booking', async () => {
      const { service, bookingsRepository } = buildService();
      bookingsRepository.lockBookingForUpdate.mockResolvedValue({
        id: 'booking-1',
        userId: 'user-1',
        status: BookingStatus.PAYMENT_PENDING,
        holdExpiresAt: null,
      });

      await expect(service.releaseHold('booking-1', 'user-1')).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('expireHoldIfStillPending', () => {
    it('expires a PAYMENT_PENDING booking whose hold window ran out (status becomes EXPIRED, not CANCELLED)', async () => {
      const { service, bookingsRepository } = buildService();
      bookingsRepository.lockBookingForUpdate.mockResolvedValue({
        id: 'booking-1',
        userId: 'user-1',
        status: BookingStatus.PAYMENT_PENDING,
        holdExpiresAt: new Date(Date.now() - 60_000),
      });

      await service.expireHoldIfStillPending('booking-1');

      expect(bookingsRepository.updateStatus).toHaveBeenCalledWith(
        expect.anything(),
        'booking-1',
        expect.objectContaining({ status: BookingStatus.EXPIRED }),
      );
    });

    it('does nothing for a CONFIRMED booking even if holdExpiresAt is in the past', async () => {
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
  });

  describe('findById', () => {
    it('throws NotFoundException when the booking does not exist (or is not owned by the caller)', async () => {
      const { service, bookingsRepository } = buildService();
      bookingsRepository.findByIdForUser.mockResolvedValue(null);

      await expect(service.findById('booking-1', 'user-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
