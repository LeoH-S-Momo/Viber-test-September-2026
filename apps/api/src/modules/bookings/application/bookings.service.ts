import { randomUUID } from 'node:crypto';
import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { BookingStatus, CabinStatus, CruiseStatus, PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';
import { CabinAvailabilityPolicy, type CabinAvailability } from '../../catalog/domain/cabin-availability.policy';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { CABIN_HOLD_EXPIRATION_JOB, CABIN_HOLD_EXPIRATION_QUEUE } from '../../../jobs/cabin-hold-queue';
import { TICKET_ISSUANCE_JOB, TICKET_ISSUANCE_QUEUE } from '../../../jobs/ticket-issuance-queue';
import { BookingGuestsPolicy } from '../domain/booking-guests.policy';
import { BookingLifecyclePolicy } from '../domain/booking-lifecycle.policy';
import { ActivityCapacityPolicy } from '../../activities/domain/activity-capacity.policy';
import { CouponPolicy } from '../../pricing/domain/coupon.policy';
import { PricingEngine } from '../../pricing/domain/pricing-engine';
import type { PricingBreakdown } from '../../pricing/domain/pricing.types';
import {
  PAYMENT_GATEWAY,
  PaymentGatewayTimeoutError,
  type ChargeResult,
  type GatewayOutcome,
  type PaymentGateway,
} from '../../payments/domain/payment-gateway';
import { TicketsService } from '../../tickets/application/tickets.service';
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

interface CheckoutLockedBooking {
  id: string;
  cruiseId: string;
  cabinId: string;
  couponId: string | null;
}

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bookingsRepository: BookingsRepository,
    private readonly configService: ConfigService,
    @Inject(PAYMENT_GATEWAY) private readonly paymentGateway: PaymentGateway,
    private readonly ticketsService: TicketsService,
    @InjectQueue(CABIN_HOLD_EXPIRATION_QUEUE) private readonly holdExpirationQueue: Queue,
    @InjectQueue(TICKET_ISSUANCE_QUEUE) private readonly ticketIssuanceQueue: Queue,
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
   * Disponibilidade de uma Experience — mesma soma usada dentro de
   * `updateDetails`, so que fora de uma transacao/lock (leitura pura, pode
   * mudar entre a resposta e um `updateDetails` real — ver ADR-0014).
   */
  async getExperienceAvailability(experienceId: string) {
    const experience = await this.bookingsRepository.findExperienceById(experienceId);
    if (!experience) {
      throw new NotFoundException('Experiencia nao encontrada.');
    }
    const reserved = await this.bookingsRepository.sumActiveExperiencePartySizePlain(experienceId);
    return {
      capacity: experience.capacity,
      reserved,
      available: experience.capacity === null ? null : experience.capacity - reserved,
    };
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

      // Capacidade de cada Experience selecionada — trava as linhas (ordem estavel, evita deadlock
      // entre updateDetails concorrentes) ANTES de somar quem mais ja reservou, mesmo principio de
      // ADR-0009/0014. `partySize` e sempre o numero de hospedes desta chamada, nunca um valor do cliente.
      const partySize = input.guests.length;
      if (experiences.length > 0) {
        const lockedExperiences = await this.bookingsRepository.lockExperiencesForUpdate(
          tx,
          experiences.map((experience) => experience.id),
        );
        const capacityById = new Map(lockedExperiences.map((experience) => [experience.id, experience.capacity]));
        const alreadyReservedById = await this.bookingsRepository.sumActiveExperiencePartySize(
          tx,
          experiences.map((experience) => experience.id),
          bookingId,
        );
        for (const experience of experiences) {
          ActivityCapacityPolicy.assertHasCapacity({
            capacity: capacityById.get(experience.id) ?? null,
            alreadyReserved: alreadyReservedById.get(experience.id) ?? 0,
            partySize,
          });
        }
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
          partySize,
        })),
        couponId,
        pricing: breakdown,
      });
    });
  }

  /**
   * Checkout completo (ver docs/architecture/decisions/0012-checkout-payment-gateway.md):
   * valida o hold, RECALCULA o preco e o cupom a partir das tabelas de
   * origem (nunca confia em `Booking.subtotalAmount`/`totalAmount`, que
   * podem estar desatualizados desde o ultimo `updateDetails`), cria o
   * `Payment` e chama o `PaymentGateway`. Idempotente/retry (ver
   * `recalculateCheckoutPricing` e o branching abaixo):
   *   - reenviar com o MESMO metodo enquanto ainda ha um pagamento PENDING
   *     REUTILIZA o mesmo `Payment`/idempotencyKey e chama o gateway de novo
   *     — cobre tanto uma tentativa duplicada (o gateway devolve o mesmo
   *     resultado, cacheado, sem cobrar de novo) quanto um retry depois de
   *     um timeout anterior (o gateway agora revela o resultado real —
   *     ver PaymentGateway/FakePaymentGateway);
   *   - reenviar com um metodo DIFERENTE enquanto ainda ha um pagamento
   *     PENDING e erro de uso (409) — o cliente deveria esperar ou cancelar;
   *   - APPROVED confirma a reserva; DECLINED libera a reserva (CANCELLED —
   *     mesmo desfecho de `cancelBooking`, disparado pelo gateway); PENDING
   *     (ex.: boleto) ou timeout deixam a reserva em PAYMENT_PENDING para
   *     ser resolvida depois por `confirmPayment` ou pela expiracao do hold.
   * A chamada ao gateway acontece FORA da transacao que prepara o
   * pagamento (nunca segurar o lock da linha da reserva durante uma
   * chamada de rede — ver ADR-0012) — por isso o metodo abre DUAS
   * transacoes, uma antes e outra depois de `paymentGateway.charge`.
   */
  async checkout(bookingId: string, userId: string, paymentMethod: PaymentMethod, idempotencyKey?: string) {
    const now = new Date();

    const prepared = await this.prisma.$transaction(async (tx) => {
      const locked = await this.bookingsRepository.lockBookingForUpdate(tx, bookingId);
      if (!locked) {
        throw new NotFoundException('Reserva nao encontrada.');
      }
      BookingLifecyclePolicy.assertOwnership(locked, userId);

      if (locked.status === BookingStatus.CONFIRMED) {
        // Idempotente, nunca um erro: outra tentativa verdadeiramente concorrente com a MESMA
        // Idempotency-Key pode ter travado a linha, criado o pagamento, chamado o gateway E
        // confirmado a reserva inteira ANTES desta requisicao sequer conseguir a sua vez do lock
        // (ver check-in/checkout-payment-gateway.e2e-spec.ts, "N truly concurrent" — foi assim
        // que este caso foi encontrado: `assertCanCheckout` rejeitava com 409 por engano aqui).
        const current = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
        return { alreadyConfirmed: current };
      }

      let existingPayment: { id: string; method: PaymentMethod } | null = null;

      if (locked.status === BookingStatus.PAYMENT_PENDING) {
        if (BookingLifecyclePolicy.isHoldExpired(locked, now)) {
          throw new ConflictException('O prazo de retencao desta cabine expirou — faca um novo hold.');
        }
        const latest = await this.bookingsRepository.findLatestPayment(tx, bookingId);
        // So deveria existir um pagamento PENDING aqui — aprovado/recusado sempre tiram a
        // reserva de PAYMENT_PENDING na mesma transacao que resolve o pagamento (ver
        // applyChargeOutcome), nunca deixando um DECLINED "orfao" com a reserva ainda pendente.
        if (!latest || latest.status !== PaymentStatus.PENDING) {
          throw new ConflictException('Esta reserva nao tem um pagamento pendente para retomar — cancele e comece de novo.');
        }
        if (latest.method !== paymentMethod) {
          throw new ConflictException('Esta reserva ja tem um checkout em andamento com outro metodo de pagamento.');
        }
        existingPayment = latest;
      } else {
        BookingLifecyclePolicy.assertCanCheckout(locked, now);
        const guestCount = await tx.bookingGuest.count({ where: { bookingId } });
        if (guestCount === 0) {
          throw new ConflictException('Informe os hospedes antes de ir para o checkout.');
        }
      }

      // "Recalcular o preco no servidor" + "validar cupom" — sempre a partir da origem (ver ADR-0012).
      const { breakdown } = await this.recalculateCheckoutPricing(tx, locked, userId, now);

      await this.bookingsRepository.updateStatus(tx, bookingId, {
        ...(locked.status !== BookingStatus.PAYMENT_PENDING ? { status: BookingStatus.PAYMENT_PENDING } : {}),
        ...breakdown,
      });

      if (existingPayment) {
        return { payment: { id: existingPayment.id, amount: breakdown.totalAmount, currency: 'BRL' } };
      }

      const payment = await this.bookingsRepository.createPayment(tx, {
        bookingId,
        method: paymentMethod,
        amount: breakdown.totalAmount,
        currency: 'BRL',
        // Placeholder — o id de verdade so existe depois da resposta do gateway (ver Payment.simulatedTransactionId).
        simulatedTransactionId: `PENDING-${randomUUID()}`,
      });
      return { payment };
    });

    if ('alreadyConfirmed' in prepared) {
      return prepared.alreadyConfirmed;
    }
    const { payment } = prepared;

    const { chargeResult, timedOut } = await this.callGateway(payment, paymentMethod, idempotencyKey);

    const finalBooking = await this.applyChargeOutcome(bookingId, payment.id, chargeResult, timedOut);
    await this.onOutcomeApplied(finalBooking);
    return finalBooking;
  }

  /**
   * Callback (simulado) de gateway de pagamento — o papel do webhook que um
   * gateway real chamaria de volta (ex.: boleto compensado, ou a resposta
   * de uma cobranca de cartao que deu timeout mas na verdade completou).
   * Nunca confia cegamente no fato de ter sido chamado: sempre CONSULTA o
   * gateway (`retrieve`) antes de confirmar — ver ADR-0012.
   */
  async confirmPayment(bookingId: string, userId: string) {
    const snapshot = await this.bookingsRepository.findByIdForUser(bookingId, userId);
    if (!snapshot) {
      throw new NotFoundException('Reserva nao encontrada.');
    }
    if (snapshot.status === BookingStatus.CONFIRMED) {
      return snapshot;
    }
    BookingLifecyclePolicy.assertCanConfirmPayment(snapshot);

    // Consulta ATOMICA (uma unica linha, nao a leitura composta de `findByIdForUser`, que pode
    // fazer mais de uma query internamente) — com N chamadas concorrentes (ver
    // cabin-hold-concurrency.e2e-spec.ts), ler `booking.status` e `payment.status` em duas
    // consultas separadas abriria uma janela onde uma tentativa concorrente ja resolveu o
    // pagamento entre uma leitura e outra, fazendo esta reserva parecer "sem pagamento pendente"
    // por engano — ver ADR-0012.
    const payment = await this.bookingsRepository.findLatestPayment(this.prisma, bookingId);
    if (!payment) {
      throw new ConflictException('Nenhum pagamento encontrado para esta reserva.');
    }
    if (payment.status !== PaymentStatus.PENDING) {
      // Uma chamada concorrente (ou um confirm-payment anterior) ja resolveu — devolve o estado
      // atual em vez de erro: nao e um uso invalido, so uma corrida que outra tentativa venceu.
      return this.bookingsRepository.findByIdForUser(bookingId, userId);
    }

    const result = await this.paymentGateway.retrieve(payment.simulatedTransactionId);

    const finalBooking = await this.applyChargeOutcome(bookingId, payment.id, result, false);
    await this.onOutcomeApplied(finalBooking);
    return finalBooking;
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
      const cancelled = await this.bookingsRepository.updateStatus(tx, bookingId, {
        status: BookingStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: reason?.trim() || 'Cancelada pelo usuario.',
      });
      // Uma reserva CONFIRMED pode ja ter tickets emitidos (ver ADR-0012/0013) — cancelar a
      // reserva precisa invalidar tambem os tickets, senao eles continuariam ISSUED e passariam
      // no check-in mesmo com a reserva cancelada. No-op (0 linhas) se nunca chegou a CONFIRMED.
      await this.ticketsService.cancelTicketsForBooking(tx, bookingId);
      return cancelled;
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
   * Recalcula subtotal/desconto/taxa/total a partir das tabelas de origem
   * (preco ATUAL da cabine, adicionais JA congelados em `priceAtBooking` —
   * ver ADR-0010, cupom JA aplicado revalidado contra o estado ATUAL) —
   * nunca a partir de `Booking.subtotalAmount`/`totalAmount`, que podem
   * estar desatualizados desde o ultimo `updateDetails` (preco da cabine
   * mudou, cupom expirou/esgotou nesse meio-tempo). "O backend e a fonte de
   * verdade" (ver ADR-0012) significa isto: nunca confiar num numero ja
   * escrito, sempre reconstruir a partir do dado primario no momento do
   * checkout.
   */
  private async recalculateCheckoutPricing(
    tx: Prisma.TransactionClient,
    locked: CheckoutLockedBooking,
    userId: string,
    now: Date,
  ): Promise<{ breakdown: PricingBreakdown }> {
    const cabin = await this.bookingsRepository.findCabinWithCategory(locked.cabinId);
    if (!cabin) {
      throw new NotFoundException('Cabine nao encontrada.');
    }
    const pricing = await this.bookingsRepository.findCruiseCabinPricing(tx, locked.cruiseId, cabin.cabinCategoryId);
    if (!pricing) {
      throw new ConflictException('Esta cabine ainda nao tem preco definido para este cruzeiro.');
    }

    const guestCount = await tx.bookingGuest.count({ where: { bookingId: locked.id } });
    const addonPrices = await this.bookingsRepository.findBookingExperiencePrices(tx, locked.id);
    const rawSubtotal = pricing.price.add(addonPrices.reduce((sum, price) => sum.add(price), new Prisma.Decimal(0)));

    let discountAmount = new Prisma.Decimal(0);
    if (locked.couponId) {
      const coupon = await this.bookingsRepository.findCouponById(locked.couponId);
      if (!coupon) {
        throw new ConflictException('O cupom aplicado a esta reserva nao existe mais.');
      }
      const userUsageCount = await this.bookingsRepository.countUserCouponUsage(tx, userId, coupon.id);
      CouponPolicy.validate(coupon, { cruiseId: locked.cruiseId, subtotalAmount: rawSubtotal, userUsageCount, now });
      discountAmount = CouponPolicy.computeDiscount(coupon, rawSubtotal);
    }

    const breakdown = PricingEngine.calculate({
      cabinPrice: pricing.price,
      passengerCount: guestCount,
      addonPrices,
      discountAmount,
    });

    return { breakdown };
  }

  /**
   * Chama o gateway (ver PaymentGateway.charge) FORA de qualquer transacao
   * — nunca segurar o lock da linha da reserva durante uma chamada de rede
   * (ver ADR-0012). Um `PaymentGatewayTimeoutError` e capturado aqui, nunca
   * propagado como erro de requisicao: nao sabemos se a cobranca completou
   * do lado do gateway, entao NUNCA assumimos sucesso nem falha.
   */
  private async callGateway(
    payment: { id: string; amount: Prisma.Decimal; currency: string },
    paymentMethod: PaymentMethod,
    idempotencyKey?: string,
  ): Promise<{ chargeResult: ChargeResult | null; timedOut: boolean }> {
    try {
      const chargeResult = await this.paymentGateway.charge({
        amount: payment.amount,
        currency: payment.currency,
        method: paymentMethod,
        idempotencyKey: idempotencyKey || payment.id,
        description: `SeaPass booking payment ${payment.id}`,
      });
      return { chargeResult, timedOut: false };
    } catch (error) {
      if (error instanceof PaymentGatewayTimeoutError) {
        this.logger.warn(`Timeout do gateway de pagamento (payment ${payment.id}): ${error.message}`);
        return { chargeResult: null, timedOut: true };
      }
      throw error;
    }
  }

  /**
   * Aplica o desfecho da cobranca (ver PaymentGateway.charge/retrieve) numa
   * SEGUNDA transacao (a primeira, que criou o Payment, ja commitou antes
   * da chamada de rede ao gateway — ver `checkout`). Reconfirma o status da
   * reserva antes de agir: se ela deixou de estar PAYMENT_PENDING nesse
   * meio-tempo (ex.: o usuario cancelou enquanto o gateway processava), o
   * pagamento e registrado para auditoria mas a reserva NAO e mexida — um
   * pagamento aprovado depois do abandono e um caso de estorno, fora de
   * escopo aqui, nao uma confirmacao silenciosa de algo que o usuario
   * desistiu.
   */
  private async applyChargeOutcome(bookingId: string, paymentId: string, chargeResult: ChargeResult | null, timedOut: boolean) {
    return this.prisma.$transaction(async (tx) => {
      const locked = await this.bookingsRepository.lockBookingForUpdate(tx, bookingId);
      if (!locked) {
        throw new NotFoundException('Reserva nao encontrada.');
      }

      if (timedOut || !chargeResult) {
        // Payment continua PENDING (ver callGateway) — nada a fazer alem de devolver o estado atual.
        return tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
      }

      if (locked.status !== BookingStatus.PAYMENT_PENDING) {
        this.logger.warn(
          `Pagamento ${paymentId} resolvido (${chargeResult.outcome}) mas a reserva ${bookingId} nao esta mais PAYMENT_PENDING (esta ${locked.status}) — registrando so no pagamento.`,
        );
        await this.bookingsRepository.updatePaymentOutcome(tx, paymentId, {
          status: this.toPaymentStatus(chargeResult.outcome),
          simulatedTransactionId: chargeResult.gatewayTransactionId,
          paidAt: chargeResult.outcome === 'APPROVED' ? new Date() : undefined,
          failureReason: chargeResult.declineReason,
        });
        return tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
      }

      if (chargeResult.outcome === 'PENDING') {
        // Gateway ainda nao decidiu (ex.: boleto gerado) — so atualiza a referencia da transacao.
        await this.bookingsRepository.updatePaymentOutcome(tx, paymentId, {
          status: PaymentStatus.PENDING,
          simulatedTransactionId: chargeResult.gatewayTransactionId,
        });
        return tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
      }

      if (chargeResult.outcome === 'DECLINED') {
        await this.bookingsRepository.updatePaymentOutcome(tx, paymentId, {
          status: PaymentStatus.DECLINED,
          simulatedTransactionId: chargeResult.gatewayTransactionId,
          failureReason: chargeResult.declineReason,
        });
        // "Confirmar ou liberar a reserva": recusa libera a reserva (mesmo desfecho de
        // cancelBooking, so que disparado pelo gateway em vez de uma acao explicita do usuario).
        return this.bookingsRepository.updateStatus(tx, bookingId, {
          status: BookingStatus.CANCELLED,
          cancelledAt: new Date(),
          cancellationReason: `Pagamento recusado: ${chargeResult.declineReason ?? 'motivo nao informado pelo gateway.'}`,
        });
      }

      // APPROVED — "confirmar a reserva" + "confirmar a cabine" (a cabine e derivada do status da
      // reserva, ver CabinAvailabilityPolicy/ADR-0008: nenhuma escrita separada e necessaria aqui).
      await this.bookingsRepository.updatePaymentOutcome(tx, paymentId, {
        status: PaymentStatus.APPROVED,
        simulatedTransactionId: chargeResult.gatewayTransactionId,
        paidAt: new Date(),
      });
      if (locked.couponId) {
        const coupon = await this.bookingsRepository.lockCouponForUpdate(tx, locked.couponId);
        if (coupon) {
          await this.bookingsRepository.incrementCouponUsage(tx, coupon.id);
        }
      }
      return this.bookingsRepository.updateStatus(tx, bookingId, {
        status: BookingStatus.CONFIRMED,
        confirmedAt: new Date(),
      });
    });
  }

  private toPaymentStatus(outcome: GatewayOutcome): PaymentStatus {
    if (outcome === 'APPROVED') return PaymentStatus.APPROVED;
    if (outcome === 'DECLINED') return PaymentStatus.DECLINED;
    return PaymentStatus.PENDING;
  }

  /** Efeitos colaterais pos-transacao de um desfecho de pagamento aplicado — nunca dentro da propria transacao. */
  private async onOutcomeApplied(booking: { id: string; status: BookingStatus }): Promise<void> {
    if (booking.status === BookingStatus.CONFIRMED) {
      await this.cancelScheduledExpiration(booking.id);
      await this.scheduleTicketIssuance(booking.id);
    } else if (booking.status === BookingStatus.CANCELLED) {
      await this.cancelScheduledExpiration(booking.id);
    }
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

  /**
   * "Emitir o ticket posteriormente" (ver ADR-0012): agendado so DEPOIS que
   * a transacao que confirmou a reserva ja commitou, com delay 0 —
   * assincrono (o cliente nao espera a emissao na resposta do checkout),
   * mas nunca a fonte de corretude do pagamento em si. Mesma politica de
   * falha silenciosa (so loga) do agendamento de expiracao.
   */
  private async scheduleTicketIssuance(bookingId: string): Promise<void> {
    try {
      await this.ticketIssuanceQueue.add(TICKET_ISSUANCE_JOB, { bookingId }, { jobId: `tickets-${bookingId}` });
    } catch (error) {
      this.logger.warn(`Nao foi possivel agendar a emissao de tickets da reserva ${bookingId}: ${(error as Error).message}`);
    }
  }
}
