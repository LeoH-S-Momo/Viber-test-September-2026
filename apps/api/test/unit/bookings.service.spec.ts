import { ConflictException, NotFoundException } from '@nestjs/common';
import { BookingStatus, CabinStatus, CouponDiscountType, CruiseStatus, PaymentStatus, Prisma } from '@prisma/client';
import { PaymentGatewayTimeoutError } from '../../src/modules/payments/domain/payment-gateway';

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
const CABIN_WITH_CATEGORY = { id: 'cabin-1', cabinCategoryId: 'cat-1', cabinCategory: { maxOccupancy: 2 } };

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
    findCruiseOrganizerId: jest.fn().mockResolvedValue({ organizerId: 'org-1' }),
    findExperiencesByIds: jest.fn().mockResolvedValue([]),
    lockExperiencesForUpdate: jest.fn().mockResolvedValue([]),
    sumActiveExperiencePartySize: jest.fn().mockResolvedValue(new Map()),
    findCouponByCode: jest.fn(),
    findCouponById: jest.fn(),
    countUserCouponUsage: jest.fn().mockResolvedValue(0),
    lockCabinForUpdate: jest.fn(),
    lockBookingForUpdate: jest.fn(),
    lockCouponForUpdate: jest.fn(),
    incrementCouponUsage: jest.fn(),
    expireStaleHold: jest.fn(),
    findActiveBooking: jest.fn(),
    findCruiseCabinPricing: jest.fn(),
    findBookingExperiencePrices: jest.fn().mockResolvedValue([]),
    createHold: jest.fn(),
    updateStatus: jest.fn(),
    replaceGuestsAndExperiences: jest.fn(),
    createPayment: jest.fn(),
    findLatestPayment: jest.fn(),
    updatePaymentOutcome: jest.fn(),
  };

  const tx = {
    booking: { findUniqueOrThrow: jest.fn() },
    bookingGuest: { count: jest.fn().mockResolvedValue(1) },
  };
  const prisma = { $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(tx)) };
  const configService = { getOrThrow: jest.fn().mockReturnValue(15) };
  const paymentGateway = { charge: jest.fn(), retrieve: jest.fn() };
  const ticketsService = { cancelTicketsForBooking: jest.fn() };
  const activitiesService = { cancelReservationsForBookings: jest.fn() };
  const holdExpirationQueue = { add: jest.fn(), remove: jest.fn() };
  const ticketIssuanceQueue = { add: jest.fn(), remove: jest.fn() };
  const auditLog = { record: jest.fn() };
  const eventEmitter = { emit: jest.fn() };

  const service = new BookingsService(
    prisma as never,
    bookingsRepository as never,
    configService as never,
    paymentGateway as never,
    ticketsService as never,
    activitiesService as never,
    holdExpirationQueue as never,
    ticketIssuanceQueue as never,
    auditLog as never,
    eventEmitter as never,
  );

  return {
    service,
    bookingsRepository,
    prisma,
    tx,
    configService,
    paymentGateway,
    ticketsService,
    activitiesService,
    holdExpirationQueue,
    ticketIssuanceQueue,
    auditLog,
    eventEmitter,
  };
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
      const { service, bookingsRepository, holdExpirationQueue } = buildService();
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
      expect(holdExpirationQueue.add).toHaveBeenCalledWith(expect.any(String), { bookingId: 'booking-1' }, expect.objectContaining({ jobId: 'booking-1' }));
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
      bookingsRepository.findCabinWithCategory.mockResolvedValue(CABIN_WITH_CATEGORY);
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
          experiences: [{ experienceId: 'exp-1', priceAtBooking: expect.any(Prisma.Decimal), partySize: 1 }],
          pricing: expect.objectContaining({ subtotalAmount: expect.any(Prisma.Decimal) }),
        }),
      );
    });

    it('rejects when an experience is at capacity, locking rows before summing (ADR-0014)', async () => {
      const { service, bookingsRepository } = buildService();
      bookingsRepository.lockBookingForUpdate.mockResolvedValue(HELD_BOOKING);
      bookingsRepository.findCabinWithCategory.mockResolvedValue(CABIN_WITH_CATEGORY);
      bookingsRepository.findExperiencesByIds.mockResolvedValue([
        { id: 'exp-1', price: new Prisma.Decimal(150), isIncluded: false },
      ]);
      bookingsRepository.lockExperiencesForUpdate.mockResolvedValue([{ id: 'exp-1', capacity: 5 }]);
      bookingsRepository.sumActiveExperiencePartySize.mockResolvedValue(new Map([['exp-1', 4]]));

      const guests = [
        { fullName: 'Ana', documentType: 'PASSPORT' as const, documentNumber: '123', isPrimary: true },
        { fullName: 'Bea', documentType: 'PASSPORT' as const, documentNumber: '456', isPrimary: false },
      ];
      await expect(
        service.updateDetails('booking-1', 'user-1', { guests, experienceIds: ['exp-1'] }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(bookingsRepository.lockExperiencesForUpdate).toHaveBeenCalledWith(expect.anything(), ['exp-1']);
      expect(bookingsRepository.replaceGuestsAndExperiences).not.toHaveBeenCalled();
    });

    it('excludes this same booking from the reserved sum (PUT replaces its own prior selection)', async () => {
      const { service, bookingsRepository } = buildService();
      bookingsRepository.lockBookingForUpdate.mockResolvedValue(HELD_BOOKING);
      bookingsRepository.findCabinWithCategory.mockResolvedValue(CABIN_WITH_CATEGORY);
      bookingsRepository.findExperiencesByIds.mockResolvedValue([
        { id: 'exp-1', price: new Prisma.Decimal(150), isIncluded: false },
      ]);
      bookingsRepository.lockExperiencesForUpdate.mockResolvedValue([{ id: 'exp-1', capacity: 2 }]);
      bookingsRepository.sumActiveExperiencePartySize.mockResolvedValue(new Map([['exp-1', 0]]));
      bookingsRepository.findCruiseCabinPricing.mockResolvedValue(PRICING);
      bookingsRepository.replaceGuestsAndExperiences.mockResolvedValue({ id: 'booking-1' });

      const guests = [{ fullName: 'Ana', documentType: 'PASSPORT' as const, documentNumber: '123', isPrimary: true }];
      await service.updateDetails('booking-1', 'user-1', { guests, experienceIds: ['exp-1'] });

      expect(bookingsRepository.sumActiveExperiencePartySize).toHaveBeenCalledWith(
        expect.anything(),
        ['exp-1'],
        'booking-1',
      );
      expect(bookingsRepository.replaceGuestsAndExperiences).toHaveBeenCalled();
    });

    it('rejects when a requested experience does not belong to this cruise', async () => {
      const { service, bookingsRepository } = buildService();
      bookingsRepository.lockBookingForUpdate.mockResolvedValue(HELD_BOOKING);
      bookingsRepository.findCabinWithCategory.mockResolvedValue(CABIN_WITH_CATEGORY);
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
      bookingsRepository.findCabinWithCategory.mockResolvedValue(CABIN_WITH_CATEGORY);
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
    const HELD_BOOKING = {
      id: 'booking-1',
      userId: 'user-1',
      cruiseId: 'cruise-1',
      cabinId: 'cabin-1',
      couponId: null,
      status: BookingStatus.HELD,
      holdExpiresAt: new Date(Date.now() + 60_000),
    };

    const PAYMENT_PENDING_BOOKING = { ...HELD_BOOKING, status: BookingStatus.PAYMENT_PENDING };

    function mockPricingLookups(bookingsRepository: ReturnType<typeof buildService>['bookingsRepository']) {
      bookingsRepository.findCabinWithCategory.mockResolvedValue(CABIN_WITH_CATEGORY);
      bookingsRepository.findCruiseCabinPricing.mockResolvedValue(PRICING);
      bookingsRepository.findBookingExperiencePrices.mockResolvedValue([]);
    }

    /**
     * `checkout` abre DUAS transacoes (ver ADR-0012) — a primeira le a reserva
     * ainda HELD e a move pra PAYMENT_PENDING; a segunda (depois da chamada
     * ao gateway) re-trava a MESMA reserva e precisa ve-la JA como
     * PAYMENT_PENDING (senao cai no branch defensivo "reserva nao esta mais
     * PAYMENT_PENDING"). `mockResolvedValueOnce` simula esse antes/depois.
     */
    function mockLockSequenceFromHeld(bookingsRepository: ReturnType<typeof buildService>['bookingsRepository']) {
      bookingsRepository.lockBookingForUpdate.mockResolvedValueOnce(HELD_BOOKING).mockResolvedValue(PAYMENT_PENDING_BOOKING);
    }

    it('moves HELD -> PAYMENT_PENDING, recalculates the price server-side (never trusting what was already stored), and charges via the gateway', async () => {
      const { service, bookingsRepository, tx, paymentGateway } = buildService();
      mockLockSequenceFromHeld(bookingsRepository);
      mockPricingLookups(bookingsRepository);
      tx.bookingGuest.count.mockResolvedValue(1);
      bookingsRepository.createPayment.mockResolvedValue({ id: 'payment-1', amount: new Prisma.Decimal(2150), currency: 'BRL' });
      paymentGateway.charge.mockResolvedValue({ outcome: 'APPROVED', gatewayTransactionId: 'FAKE-1' });
      bookingsRepository.updateStatus.mockResolvedValue({ id: 'booking-1', status: BookingStatus.CONFIRMED });

      const result = await service.checkout('booking-1', 'user-1', 'CREDIT_CARD');

      // "Recalcular o preco no servidor": a conta e refeita a partir do preco da cabine, nao lida de uma coluna ja salva.
      expect(bookingsRepository.findCruiseCabinPricing).toHaveBeenCalled();
      expect(bookingsRepository.createPayment).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ bookingId: 'booking-1', method: 'CREDIT_CARD', amount: expect.any(Prisma.Decimal) }),
      );
      expect(paymentGateway.charge).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'CREDIT_CARD', idempotencyKey: 'payment-1' }),
      );
      expect(bookingsRepository.updatePaymentOutcome).toHaveBeenCalledWith(
        expect.anything(),
        'payment-1',
        expect.objectContaining({ status: PaymentStatus.APPROVED }),
      );
      expect(result).toMatchObject({ status: BookingStatus.CONFIRMED });
    });

    it('passes a client-supplied Idempotency-Key through to the gateway instead of the default (payment id)', async () => {
      const { service, bookingsRepository, tx, paymentGateway } = buildService();
      mockLockSequenceFromHeld(bookingsRepository);
      mockPricingLookups(bookingsRepository);
      tx.bookingGuest.count.mockResolvedValue(1);
      bookingsRepository.createPayment.mockResolvedValue({ id: 'payment-1', amount: new Prisma.Decimal(2150), currency: 'BRL' });
      paymentGateway.charge.mockResolvedValue({ outcome: 'APPROVED', gatewayTransactionId: 'FAKE-1' });
      bookingsRepository.updateStatus.mockResolvedValue({ id: 'booking-1', status: BookingStatus.CONFIRMED });

      await service.checkout('booking-1', 'user-1', 'CREDIT_CARD', 'client-key-xyz');

      expect(paymentGateway.charge).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'client-key-xyz' }));
    });

    it('rejects checkout when there are no guests yet', async () => {
      const { service, bookingsRepository, tx } = buildService();
      bookingsRepository.lockBookingForUpdate.mockResolvedValue(HELD_BOOKING);
      tx.bookingGuest.count.mockResolvedValue(0);

      await expect(service.checkout('booking-1', 'user-1', 'CREDIT_CARD')).rejects.toBeInstanceOf(ConflictException);
      expect(bookingsRepository.createPayment).not.toHaveBeenCalled();
    });

    it('retrying with the same method while a payment is still PENDING REUSES the same payment/idempotencyKey and calls the gateway again (covers both a duplicate attempt and a retry after a timeout)', async () => {
      const { service, bookingsRepository, paymentGateway } = buildService();
      bookingsRepository.lockBookingForUpdate.mockResolvedValue({ ...HELD_BOOKING, status: BookingStatus.PAYMENT_PENDING });
      bookingsRepository.findLatestPayment.mockResolvedValue({ id: 'payment-1', method: 'CREDIT_CARD', status: PaymentStatus.PENDING });
      mockPricingLookups(bookingsRepository);
      paymentGateway.charge.mockResolvedValue({ outcome: 'APPROVED', gatewayTransactionId: 'FAKE-1' });
      bookingsRepository.updateStatus.mockResolvedValue({ id: 'booking-1', status: BookingStatus.CONFIRMED });

      const result = await service.checkout('booking-1', 'user-1', 'CREDIT_CARD');

      // Nao cria um Payment novo — a chave de idempotencia (payment-1) e a MESMA da tentativa
      // original, entao o FakePaymentGateway (ou um gateway real) devolve o resultado ja
      // decidido em vez de cobrar de novo. E exatamente essa reutilizacao que torna seguro
      // tanto um clique duplicado quanto um retry deliberado apos um timeout.
      expect(bookingsRepository.createPayment).not.toHaveBeenCalled();
      expect(paymentGateway.charge).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'payment-1' }));
      expect(result).toMatchObject({ status: BookingStatus.CONFIRMED });
    });

    it('rejects retrying checkout with a different payment method while one is still PENDING', async () => {
      const { service, bookingsRepository } = buildService();
      bookingsRepository.lockBookingForUpdate.mockResolvedValue({ ...HELD_BOOKING, status: BookingStatus.PAYMENT_PENDING });
      bookingsRepository.findLatestPayment.mockResolvedValue({ id: 'payment-1', method: 'PIX', status: PaymentStatus.PENDING });

      await expect(service.checkout('booking-1', 'user-1', 'CREDIT_CARD')).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects checkout when PAYMENT_PENDING but there is no PENDING payment to resume (defensive — a DECLINED/APPROVED payment always takes the booking out of PAYMENT_PENDING in the same transaction, so this should never happen in practice)', async () => {
      const { service, bookingsRepository } = buildService();
      bookingsRepository.lockBookingForUpdate.mockResolvedValue({ ...HELD_BOOKING, status: BookingStatus.PAYMENT_PENDING });
      bookingsRepository.findLatestPayment.mockResolvedValue({ id: 'payment-old', method: 'CREDIT_CARD', status: PaymentStatus.DECLINED });

      await expect(service.checkout('booking-1', 'user-1', 'CREDIT_CARD')).rejects.toBeInstanceOf(ConflictException);
    });

    it('cancels (releases) the booking when the gateway declines the charge', async () => {
      const { service, bookingsRepository, tx, paymentGateway } = buildService();
      mockLockSequenceFromHeld(bookingsRepository);
      mockPricingLookups(bookingsRepository);
      tx.bookingGuest.count.mockResolvedValue(1);
      bookingsRepository.createPayment.mockResolvedValue({ id: 'payment-1', amount: new Prisma.Decimal(2150), currency: 'BRL' });
      paymentGateway.charge.mockResolvedValue({ outcome: 'DECLINED', gatewayTransactionId: 'FAKE-3', declineReason: 'saldo insuficiente' });
      bookingsRepository.updateStatus.mockResolvedValue({ id: 'booking-1', status: BookingStatus.CANCELLED });

      const result = await service.checkout('booking-1', 'user-1', 'CREDIT_CARD');

      expect(bookingsRepository.updatePaymentOutcome).toHaveBeenCalledWith(
        expect.anything(),
        'payment-1',
        expect.objectContaining({ status: PaymentStatus.DECLINED, failureReason: 'saldo insuficiente' }),
      );
      expect(bookingsRepository.updateStatus).toHaveBeenCalledWith(
        expect.anything(),
        'booking-1',
        expect.objectContaining({ status: BookingStatus.CANCELLED }),
      );
      expect(result).toMatchObject({ status: BookingStatus.CANCELLED });
    });

    it('leaves the booking PAYMENT_PENDING — never confirms nor cancels — when the gateway call times out', async () => {
      const { service, bookingsRepository, tx, paymentGateway } = buildService();
      bookingsRepository.lockBookingForUpdate.mockResolvedValue(HELD_BOOKING);
      mockPricingLookups(bookingsRepository);
      tx.bookingGuest.count.mockResolvedValue(1);
      bookingsRepository.createPayment.mockResolvedValue({ id: 'payment-1', amount: new Prisma.Decimal(2150), currency: 'BRL' });
      paymentGateway.charge.mockRejectedValue(new PaymentGatewayTimeoutError());
      tx.booking.findUniqueOrThrow.mockResolvedValue({ id: 'booking-1', status: BookingStatus.PAYMENT_PENDING });

      const result = await service.checkout('booking-1', 'user-1', 'CREDIT_CARD');

      expect(bookingsRepository.updatePaymentOutcome).not.toHaveBeenCalled();
      expect(result).toMatchObject({ status: BookingStatus.PAYMENT_PENDING });
    });

    it('propagates a genuine (non-timeout) gateway error instead of silently masking it as pending', async () => {
      const { service, bookingsRepository, tx, paymentGateway } = buildService();
      bookingsRepository.lockBookingForUpdate.mockResolvedValue(HELD_BOOKING);
      mockPricingLookups(bookingsRepository);
      tx.bookingGuest.count.mockResolvedValue(1);
      bookingsRepository.createPayment.mockResolvedValue({ id: 'payment-1', amount: new Prisma.Decimal(2150), currency: 'BRL' });
      paymentGateway.charge.mockRejectedValue(new Error('gateway explodiu'));

      await expect(service.checkout('booking-1', 'user-1', 'CREDIT_CARD')).rejects.toThrow('gateway explodiu');
    });

    it('returns the current booking (idempotent, no error) when a truly concurrent twin request already confirmed it before this one acquired the lock', async () => {
      // Regressao real, encontrada por check-in/checkout-payment-gateway.e2e-spec.ts com 6/10
      // requisicoes verdadeiramente concorrentes (Promise.all): quando o pedido chega tarde
      // demais (o gemeo concorrente ja completou hold->pagamento->gateway->CONFIRMED inteiro
      // antes deste sequer travar a linha), `locked.status` e CONFIRMED — cair no branch HELD
      // (`assertCanCheckout`) rejeitava com 409 por engano em vez de tratar como idempotente.
      const { service, bookingsRepository, tx, paymentGateway } = buildService();
      bookingsRepository.lockBookingForUpdate.mockResolvedValue({ ...HELD_BOOKING, status: BookingStatus.CONFIRMED });
      tx.booking.findUniqueOrThrow.mockResolvedValue({ id: 'booking-1', status: BookingStatus.CONFIRMED });

      const result = await service.checkout('booking-1', 'user-1', 'CREDIT_CARD');

      expect(result).toMatchObject({ status: BookingStatus.CONFIRMED });
      expect(bookingsRepository.createPayment).not.toHaveBeenCalled();
      expect(paymentGateway.charge).not.toHaveBeenCalled();
    });
  });

  describe('confirmPayment', () => {
    const PAYMENT_PENDING_SNAPSHOT = {
      id: 'booking-1',
      userId: 'user-1',
      status: BookingStatus.PAYMENT_PENDING,
      holdExpiresAt: null,
      couponId: null as string | null,
    };
    const PENDING_PAYMENT = { id: 'payment-1', status: PaymentStatus.PENDING, simulatedTransactionId: 'PENDING-abc' };

    it('verifies the outcome WITH THE GATEWAY (never trusts the callback blindly) before confirming', async () => {
      const { service, bookingsRepository, paymentGateway } = buildService();
      bookingsRepository.findByIdForUser.mockResolvedValue(PAYMENT_PENDING_SNAPSHOT);
      bookingsRepository.findLatestPayment.mockResolvedValue(PENDING_PAYMENT);
      bookingsRepository.lockBookingForUpdate.mockResolvedValue({ ...PAYMENT_PENDING_SNAPSHOT });
      paymentGateway.retrieve.mockResolvedValue({ outcome: 'APPROVED', gatewayTransactionId: 'FAKE-1' });
      bookingsRepository.updateStatus.mockResolvedValue({ id: 'booking-1', status: BookingStatus.CONFIRMED });

      const result = await service.confirmPayment('booking-1', 'user-1');

      expect(paymentGateway.retrieve).toHaveBeenCalledWith('PENDING-abc');
      expect(bookingsRepository.updatePaymentOutcome).toHaveBeenCalledWith(
        expect.anything(),
        'payment-1',
        expect.objectContaining({ status: PaymentStatus.APPROVED }),
      );
      expect(result).toMatchObject({ status: BookingStatus.CONFIRMED });
    });

    it('is idempotent: does nothing (no gateway call) when already CONFIRMED', async () => {
      const { service, bookingsRepository, paymentGateway } = buildService();
      bookingsRepository.findByIdForUser.mockResolvedValue({ id: 'booking-1', status: BookingStatus.CONFIRMED });

      const result = await service.confirmPayment('booking-1', 'user-1');

      expect(result).toMatchObject({ status: BookingStatus.CONFIRMED });
      expect(bookingsRepository.findLatestPayment).not.toHaveBeenCalled();
      expect(paymentGateway.retrieve).not.toHaveBeenCalled();
      expect(bookingsRepository.updateStatus).not.toHaveBeenCalled();
    });

    it('increments coupon usage when the booking has one applied and the gateway confirms approval', async () => {
      const { service, bookingsRepository, paymentGateway } = buildService();
      const snapshot = { ...PAYMENT_PENDING_SNAPSHOT, couponId: 'coupon-1' };
      bookingsRepository.findByIdForUser.mockResolvedValue(snapshot);
      bookingsRepository.findLatestPayment.mockResolvedValue(PENDING_PAYMENT);
      bookingsRepository.lockBookingForUpdate.mockResolvedValue(snapshot);
      paymentGateway.retrieve.mockResolvedValue({ outcome: 'APPROVED', gatewayTransactionId: 'FAKE-1' });
      bookingsRepository.lockCouponForUpdate.mockResolvedValue({ id: 'coupon-1' });
      bookingsRepository.updateStatus.mockResolvedValue({ id: 'booking-1', status: BookingStatus.CONFIRMED });

      await service.confirmPayment('booking-1', 'user-1');

      expect(bookingsRepository.incrementCouponUsage).toHaveBeenCalledWith(expect.anything(), 'coupon-1');
    });

    it('rejects confirming when there is no payment on file at all', async () => {
      const { service, bookingsRepository } = buildService();
      bookingsRepository.findByIdForUser.mockResolvedValue(PAYMENT_PENDING_SNAPSHOT);
      bookingsRepository.findLatestPayment.mockResolvedValue(null);

      await expect(service.confirmPayment('booking-1', 'user-1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('gracefully returns the current state (no error) when a concurrent call already resolved the payment — a race, not a misuse (ver ADR-0012)', async () => {
      const { service, bookingsRepository, paymentGateway } = buildService();
      const resolvedSnapshot = { id: 'booking-1', status: BookingStatus.CONFIRMED };
      bookingsRepository.findByIdForUser
        .mockResolvedValueOnce(PAYMENT_PENDING_SNAPSHOT) // 1a leitura: ainda parecia PAYMENT_PENDING
        .mockResolvedValueOnce(resolvedSnapshot); // 2a leitura (apos ver o pagamento ja resolvido): reflete o estado real
      bookingsRepository.findLatestPayment.mockResolvedValue({ ...PENDING_PAYMENT, status: PaymentStatus.APPROVED });

      const result = await service.confirmPayment('booking-1', 'user-1');

      expect(paymentGateway.retrieve).not.toHaveBeenCalled();
      expect(result).toBe(resolvedSnapshot);
    });

    it('cancels the booking when the gateway reveals the payment was actually declined', async () => {
      const { service, bookingsRepository, paymentGateway } = buildService();
      bookingsRepository.findByIdForUser.mockResolvedValue(PAYMENT_PENDING_SNAPSHOT);
      bookingsRepository.findLatestPayment.mockResolvedValue(PENDING_PAYMENT);
      bookingsRepository.lockBookingForUpdate.mockResolvedValue({ ...PAYMENT_PENDING_SNAPSHOT });
      paymentGateway.retrieve.mockResolvedValue({ outcome: 'DECLINED', gatewayTransactionId: 'FAKE-1', declineReason: 'expirado' });
      bookingsRepository.updateStatus.mockResolvedValue({ id: 'booking-1', status: BookingStatus.CANCELLED });

      const result = await service.confirmPayment('booking-1', 'user-1');

      expect(result).toMatchObject({ status: BookingStatus.CANCELLED });
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
