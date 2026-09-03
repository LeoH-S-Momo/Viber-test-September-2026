import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { BookingStatus, CabinStatus, CruiseStatus, PaymentMethod, Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';
import { CabinAvailabilityPolicy, type CabinAvailability } from '../../catalog/domain/cabin-availability.policy';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { CABIN_HOLD_EXPIRATION_JOB, CABIN_HOLD_EXPIRATION_QUEUE } from '../../../jobs/cabin-hold-queue';
import { BookingGuestsPolicy } from '../domain/booking-guests.policy';
import { BookingLifecyclePolicy } from '../domain/booking-lifecycle.policy';
import { CouponPolicy } from '../../pricing/domain/coupon.policy';
import { PricingEngine } from '../../pricing/domain/pricing-engine';
import { BookingsRepository } from '../persistence/bookings.repository';

export interface GuestDetailInput {
  fullName: string;
  documentType: 'PASSPORT' | 'NATIONAL_ID';
  documentNumber: string;
  birthDate?: Date;
  isPrimary: boolean;
}

export interface UpdateBookingDetailsInput {
  guests: GuestDetailInput[];
  experienceIds: string[];
  couponCode?: string;
}

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bookingsRepository: BookingsRepository,
    private readonly configService: ConfigService,
    @InjectQueue(CABIN_HOLD_EXPIRATION_QUEUE) private readonly holdExpirationQueue: Queue,
  ) {}

  private get holdMinutes(): number {
    return this.configService.getOrThrow<number>('CABIN_HOLD_MINUTES');
  }

  findMine(userId: string) {
    return this.bookingsRepository.findMine(userId);
  }

  /** Consulta de uma reserva especifica — 404 (nao 403) pra quem nao e dono, ver ADR-0005. */
  async findById(bookingId: string, userId: string) {
    const booking = await this.bookingsRepository.findByIdForUser(bookingId, userId);
    if (!booking) {
      throw new NotFoundException('Reserva nao encontrada.');
    }
    return booking;
  }

  /** Consulta de disponibilidade — leitura pura, sem lock (nao decide nada, so projeta o estado atual). */
  async getCabinAvailability(cruiseSlug: string, cabinId: string): Promise<CabinAvailability> {
    const cruise = await this.requirePublishedCruiseBySlug(cruiseSlug);
    const cabin = await this.bookingsRepository.findCabinStatus(cabinId);
    if (!cabin) {
      throw new NotFoundException('Cabine nao encontrada.');
    }
    const activeBooking = await this.bookingsRepository.findActiveBookingPlain(cabinId, cruise.id);
    return CabinAvailabilityPolicy.resolve(cabin.status, activeBooking ?? undefined);
  }

  /**
   * Criacao da reserva (hold) — a secao critica que precisa ser segura
   * contra concorrencia. Ver ADR-0009 para a estrategia (transacao +
   * `SELECT ... FOR UPDATE` na cabine + expiracao inline + indice unico
   * parcial) e ADR-0010 para a idempotencia via `idempotencyKey`.
   */
  async holdCabin(userId: string, cruiseSlug: string, cabinId: string, idempotencyKey?: string) {
    if (idempotencyKey) {
      const existing = await this.bookingsRepository.findByIdempotencyKey(userId, idempotencyKey);
      if (existing) {
        return existing;
      }
    }

    const cruise = await this.requirePublishedCruiseBySlug(cruiseSlug);
    const now = new Date();
    const holdMinutes = this.holdMinutes;

    const booking = await this.prisma.$transaction(async (tx) => {
      const cabin = await this.bookingsRepository.lockCabinForUpdate(tx, cabinId);
      if (!cabin) {
        throw new NotFoundException('Cabine nao encontrada.');
      }
      if (cabin.status !== CabinStatus.ACTIVE) {
        throw new ConflictException('Esta cabine nao esta disponivel para reserva (fora de operacao).');
      }

      // Fecha o ciclo de qualquer hold/checkout anterior ja expirado desta
      // MESMA cabine+cruzeiro antes de checar disponibilidade — sem isto o
      // indice unico parcial bloquearia uma cabine livre pra sempre depois
      // que o anterior expirasse sem nunca ser fechado de fato.
      await this.bookingsRepository.expireStaleHold(tx, cabinId, cruise.id, now);

      const active = await this.bookingsRepository.findActiveBooking(tx, cabinId, cruise.id);
      if (active) {
        // Corrida real entre 2 requests com a MESMA idempotencyKey (nao so
        // um retry sequencial, que o check no topo do metodo ja resolve) —
        // a segunda a chegar aqui ve a reserva que a primeira acabou de
        // criar e devolve o mesmo resultado em vez de um 409.
        if (idempotencyKey && active.userId === userId && active.idempotencyKey === idempotencyKey) {
          return active;
        }
        throw new ConflictException('Esta cabine ja esta reservada ou em processo de reserva.');
      }

      const pricing = await this.bookingsRepository.findCruiseCabinPricing(tx, cruise.id, cabin.cabinCategoryId);
      if (!pricing) {
        throw new ConflictException('Esta cabine ainda nao tem preco definido para este cruzeiro.');
      }

      const holdExpiresAt = BookingLifecyclePolicy.computeHoldExpiry(now, holdMinutes);
      // Ainda sem hospedes nesta etapa (informados so em updateDetails) — passengerCount 0
      // significa "sem taxa de embarque ainda", recalculada assim que o usuario informar quem viaja.
      const breakdown = PricingEngine.calculate({
        cabinPrice: pricing.price,
        passengerCount: 0,
        addonPrices: [],
        discountAmount: new Prisma.Decimal(0),
      });

      try {
        return await this.bookingsRepository.createHold(tx, {
          userId,
          cruiseId: cruise.id,
          cabinId,
          subtotalAmount: breakdown.subtotalAmount,
          discountAmount: breakdown.discountAmount,
          feeAmount: breakdown.feeAmount,
          totalAmount: breakdown.totalAmount,
          currency: pricing.currency,
          holdExpiresAt,
          idempotencyKey,
        });
      } catch (error) {
        // Rede de seguranca: mesmo que o lock/checagem acima tenha um bug no
        // futuro, os indices unicos (cabine ativa por cruzeiro, ou
        // idempotencyKey por usuario) recusam a segunda linha no nivel do
        // banco — traduzido pro mesmo erro de negocio, nao um 500 cru.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException('Esta cabine ja esta reservada ou em processo de reserva.');
        }
        throw error;
      }
    });

    await this.scheduleExpiration(booking.id, booking.holdExpiresAt);
    return booking;
  }

  /**
   * "Informa passageiros" + "seleciona adicionais": substitui hospedes e
   * experiencias por completo (PUT idempotente) e recalcula o preco. So
   * valido enquanto a reserva ainda esta HELD (ver
   * BookingLifecyclePolicy.assertCanEditDetails) — pode ser chamado quantas
   * vezes o usuario quiser editar o formulario antes do checkout.
   */
  async updateDetails(bookingId: string, userId: string, input: UpdateBookingDetailsInput) {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const locked = await this.bookingsRepository.lockBookingForUpdate(tx, bookingId);
      if (!locked) {
        throw new NotFoundException('Reserva nao encontrada.');
      }
      BookingLifecyclePolicy.assertOwnership(locked, userId);
      BookingLifecyclePolicy.assertCanEditDetails(locked, now);

      const cabin = await this.bookingsRepository.findCabinWithCategory(locked.cabinId);
      if (!cabin) {
        throw new NotFoundException('Cabine nao encontrada.');
      }
      BookingGuestsPolicy.assertValidGuestList(input.guests, cabin.cabinCategory.maxOccupancy);

      const experiences = await this.bookingsRepository.findExperiencesByIds(locked.cruiseId, input.experienceIds);
      if (experiences.length !== new Set(input.experienceIds).size) {
        throw new ConflictException('Um ou mais adicionais selecionados nao pertencem a este cruzeiro.');
      }

      const pricing = await this.bookingsRepository.findCruiseCabinPricing(tx, locked.cruiseId, cabin.cabinCategoryId);
      if (!pricing) {
        throw new ConflictException('Esta cabine ainda nao tem preco definido para este cruzeiro.');
      }

      const experiencePriceOf = (experience: (typeof experiences)[number]): Prisma.Decimal =>
        experience.isIncluded ? new Prisma.Decimal(0) : (experience.price ?? new Prisma.Decimal(0));
      const addonPrices = experiences.map(experiencePriceOf);
      // So para o check de valor minimo do cupom — o subtotal "oficial" (arredondado) sai do
      // proprio PricingEngine.calculate logo abaixo; os dois batem pois usam os mesmos insumos.
      const rawSubtotal = pricing.price.add(addonPrices.reduce((sum, price) => sum.add(price), new Prisma.Decimal(0)));

      let couponId: string | null = null;
      let discountAmount = new Prisma.Decimal(0);
      if (input.couponCode) {
        const found = await this.bookingsRepository.findCouponByCode(input.couponCode);
        const coupon = CouponPolicy.assertFound(found);
        const userUsageCount = await this.bookingsRepository.countUserCouponUsage(tx, userId, coupon.id);
        CouponPolicy.validate(coupon, { cruiseId: locked.cruiseId, subtotalAmount: rawSubtotal, userUsageCount, now });
        couponId = coupon.id;
        discountAmount = CouponPolicy.computeDiscount(coupon, rawSubtotal);
      }

      const breakdown = PricingEngine.calculate({
        cabinPrice: pricing.price,
        passengerCount: input.guests.length,
        addonPrices,
        discountAmount,
      });

      return this.bookingsRepository.replaceGuestsAndExperiences(tx, bookingId, {
        guests: input.guests,
        experiences: experiences.map((experience) => ({
          experienceId: experience.id,
          priceAtBooking: experiencePriceOf(experience),
        })),
        couponId,
        pricing: breakdown,
      });
    });
  }

  /**
   * "Checkout": HELD -> PAYMENT_PENDING, cria o Payment simulado (`ver
   * Payment.simulatedTransactionId` — nenhum gateway real e chamado).
   * Idempotente por estado: reenviar o checkout com o MESMO metodo de
   * pagamento enquanto ainda esta PAYMENT_PENDING devolve o estado atual em
   * vez de tentar abrir um segundo pagamento.
   */
  async checkout(bookingId: string, userId: string, paymentMethod: PaymentMethod) {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const locked = await this.bookingsRepository.lockBookingForUpdate(tx, bookingId);
      if (!locked) {
        throw new NotFoundException('Reserva nao encontrada.');
      }
      BookingLifecyclePolicy.assertOwnership(locked, userId);

      if (locked.status === BookingStatus.PAYMENT_PENDING) {
        const pending = await this.bookingsRepository.findPendingPayment(tx, bookingId);
        if (pending && pending.method === paymentMethod) {
          return tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
        }
        throw new ConflictException('Esta reserva ja tem um checkout em andamento com outro metodo de pagamento.');
      }

      BookingLifecyclePolicy.assertCanCheckout(locked, now);

      const guestCount = await tx.bookingGuest.count({ where: { bookingId } });
      if (guestCount === 0) {
        throw new ConflictException('Informe os hospedes antes de ir para o checkout.');
      }

      await this.bookingsRepository.updateStatus(tx, bookingId, { status: BookingStatus.PAYMENT_PENDING });
      const bookingRow = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });

      await this.bookingsRepository.createPayment(tx, {
        bookingId,
        method: paymentMethod,
        amount: bookingRow.totalAmount,
        currency: bookingRow.currency,
        simulatedTransactionId: `SIMULATED-${randomUUID()}`,
      });

      return bookingRow;
    });
  }

  /**
   * Confirmacao de pagamento (simulado — nenhum gateway real). Idempotente
   * de proposito: um callback retentado que ja foi processado antes so
   * devolve a reserva CONFIRMED, sem erro (ver BookingLifecyclePolicy).
   */
  async confirmPayment(bookingId: string, userId: string) {
    const booking = await this.prisma.$transaction(async (tx) => {
      const locked = await this.bookingsRepository.lockBookingForUpdate(tx, bookingId);
      if (!locked) {
        throw new NotFoundException('Reserva nao encontrada.');
      }
      BookingLifecyclePolicy.assertOwnership(locked, userId);
      BookingLifecyclePolicy.assertCanConfirmPayment(locked);

      const full = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
      if (full.status === BookingStatus.CONFIRMED) {
        return full;
      }

      const payment = await this.bookingsRepository.findPendingPayment(tx, bookingId);
      if (!payment) {
        throw new ConflictException('Nenhum pagamento pendente encontrado para esta reserva.');
      }

      const now = new Date();
      await this.bookingsRepository.approvePayment(tx, payment.id, now);

      if (full.couponId) {
        const coupon = await this.bookingsRepository.lockCouponForUpdate(tx, full.couponId);
        if (coupon) {
          await this.bookingsRepository.incrementCouponUsage(tx, coupon.id);
        }
      }

      return this.bookingsRepository.updateStatus(tx, bookingId, {
        status: BookingStatus.CONFIRMED,
        confirmedAt: now,
      });
    });

    await this.cancelScheduledExpiration(booking.id);
    return booking;
  }

  /** Cancelamento — HELD, PAYMENT_PENDING ou CONFIRMED -> CANCELLED. */
  async cancelBooking(bookingId: string, userId: string, reason?: string) {
    const booking = await this.prisma.$transaction(async (tx) => {
      const locked = await this.bookingsRepository.lockBookingForUpdate(tx, bookingId);
      if (!locked) {
        throw new NotFoundException('Reserva nao encontrada.');
      }
      BookingLifecyclePolicy.assertOwnership(locked, userId);
      BookingLifecyclePolicy.assertCanCancel(locked);
      return this.bookingsRepository.updateStatus(tx, bookingId, {
        status: BookingStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: reason?.trim() || 'Cancelada pelo usuario.',
      });
    });

    await this.cancelScheduledExpiration(booking.id);
    return booking;
  }

  /** Liberacao — especificamente HELD -> CANCELLED (abandonar um hold antes mesmo do checkout). */
  async releaseHold(bookingId: string, userId: string) {
    const booking = await this.prisma.$transaction(async (tx) => {
      const locked = await this.bookingsRepository.lockBookingForUpdate(tx, bookingId);
      if (!locked) {
        throw new NotFoundException('Reserva nao encontrada.');
      }
      BookingLifecyclePolicy.assertOwnership(locked, userId);
      BookingLifecyclePolicy.assertCanRelease(locked);
      return this.bookingsRepository.updateStatus(tx, bookingId, {
        status: BookingStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: 'Hold liberado pelo usuario.',
      });
    });

    await this.cancelScheduledExpiration(booking.id);
    return booking;
  }

  /**
   * Expiracao — chamada pelo processor da fila (CabinHoldExpirationProcessor).
   * Reconfirma o estado antes de agir: a reserva pode ja ter avancado
   * (confirmada/cancelada) entre o agendamento do job e sua execucao.
   */
  async expireHoldIfStillPending(bookingId: string): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const locked = await this.bookingsRepository.lockBookingForUpdate(tx, bookingId);
      if (!locked) return;
      const isExpirable = locked.status === BookingStatus.HELD || locked.status === BookingStatus.PAYMENT_PENDING;
      if (!isExpirable || !BookingLifecyclePolicy.isHoldExpired(locked, now)) {
        return;
      }
      await this.bookingsRepository.updateStatus(tx, bookingId, {
        status: BookingStatus.EXPIRED,
        cancelledAt: now,
        cancellationReason: 'Hold expirado automaticamente.',
      });
    });
  }

  private async requirePublishedCruiseBySlug(slug: string) {
    const cruise = await this.bookingsRepository.findCruiseBySlug(slug);
    if (!cruise || cruise.status !== CruiseStatus.PUBLISHED) {
      throw new NotFoundException('Cruzeiro nao encontrado.');
    }
    return cruise;
  }

  /**
   * Agenda a expiracao proativa via BullMQ (delay = tempo ate
   * holdExpiresAt). So uma melhoria de UX — nunca a fonte de corretude (ver
   * comentario no processor e ADR-0009) — por isso uma falha aqui (Redis
   * fora do ar) e so logada, nunca propagada: o hold em si ja foi criado
   * com sucesso no Postgres.
   */
  private async scheduleExpiration(bookingId: string, holdExpiresAt: Date | null): Promise<void> {
    if (!holdExpiresAt) return;
    const delay = Math.max(0, holdExpiresAt.getTime() - Date.now());
    try {
      await this.holdExpirationQueue.add(
        CABIN_HOLD_EXPIRATION_JOB,
        { bookingId },
        { jobId: bookingId, delay },
      );
    } catch (error) {
      this.logger.warn(`Nao foi possivel agendar a expiracao do hold ${bookingId}: ${(error as Error).message}`);
    }
  }

  private async cancelScheduledExpiration(bookingId: string): Promise<void> {
    try {
      await this.holdExpirationQueue.remove(bookingId);
    } catch (error) {
      this.logger.warn(`Nao foi possivel remover o job de expiracao do hold ${bookingId}: ${(error as Error).message}`);
    }
  }
}
