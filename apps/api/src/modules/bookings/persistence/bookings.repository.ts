import { Injectable } from '@nestjs/common';
import { ActivityReservationStatus, BookingStatus, CabinStatus, PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import type { CouponRecord } from '../../pricing/domain/pricing.types';

interface LockedCabin {
  id: string;
  status: CabinStatus;
  cabinCategoryId: string;
}

interface LockedBooking {
  id: string;
  userId: string;
  cruiseId: string;
  cabinId: string;
  couponId: string | null;
  status: BookingStatus;
  holdExpiresAt: Date | null;
}

/** Estados que hoje bloqueiam a cabine para um cruzeiro — usado tanto pra checar disponibilidade quanto pra expirar. */
const ACTIVE_BOOKING_STATUSES: BookingStatus[] = [
  BookingStatus.HELD,
  BookingStatus.PAYMENT_PENDING,
  BookingStatus.CONFIRMED,
];

/**
 * Toda escrita que participa da maquina de estados do hold/checkout roda
 * dentro de uma `Prisma.TransactionClient` (`tx`), nunca do client "solto"
 * — `BookingsService` abre a transacao e passa `tx` pra cada chamada aqui.
 * Ver ADR-0009 (motor de hold) e ADR-0010 (dominio completo de Booking)
 * para o porque disto ser o que garante ausencia de overbooking/corrida.
 */
@Injectable()
export class BookingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMine(userId: string) {
    return this.prisma.booking.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        cruise: { select: { id: true, title: true, slug: true, embarkationDate: true } },
        cabin: { select: { id: true, code: true, cabinCategory: { select: { name: true, maxOccupancy: true } } } },
        guests: true,
        experiences: { include: { experience: { select: { id: true, title: true } } } },
        eventReservations: {
          where: { status: ActivityReservationStatus.CONFIRMED },
          include: { event: { include: { venue: true, artist: true } } },
        },
        diningReservations: {
          where: { status: ActivityReservationStatus.CONFIRMED },
          include: { diningSlot: { include: { restaurant: true } } },
        },
        payments: { orderBy: { createdAt: 'desc' } },
      },
    });
  }

  findByIdForUser(bookingId: string, userId: string) {
    return this.prisma.booking.findFirst({
      where: { id: bookingId, userId },
      include: {
        cruise: { select: { id: true, title: true, slug: true, embarkationDate: true } },
        cabin: { select: { id: true, code: true, cabinCategory: { select: { name: true, maxOccupancy: true } } } },
        guests: true,
        experiences: { include: { experience: { select: { id: true, title: true } } } },
        eventReservations: {
          where: { status: ActivityReservationStatus.CONFIRMED },
          include: { event: { include: { venue: true, artist: true } } },
        },
        diningReservations: {
          where: { status: ActivityReservationStatus.CONFIRMED },
          include: { diningSlot: { include: { restaurant: true } } },
        },
        payments: { orderBy: { createdAt: 'desc' } },
        coupon: { select: { code: true } },
      },
    });
  }

  findByIdempotencyKey(userId: string, idempotencyKey: string) {
    return this.prisma.booking.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
    });
  }

  findCabinStatus(cabinId: string) {
    return this.prisma.cabin.findUnique({ where: { id: cabinId }, select: { status: true } });
  }

  findCabinWithCategory(cabinId: string) {
    return this.prisma.cabin.findUnique({
      where: { id: cabinId },
      select: { id: true, cabinCategoryId: true, cabinCategory: { select: { maxOccupancy: true } } },
    });
  }

  /** Leitura simples (sem lock) — usada so pela consulta de disponibilidade, nunca antes de escrever. */
  findActiveBookingPlain(cabinId: string, cruiseId: string) {
    return this.prisma.booking.findFirst({
      where: { cabinId, cruiseId, status: { in: ACTIVE_BOOKING_STATUSES } },
      select: { status: true, holdExpiresAt: true },
    });
  }

  findCruiseStatus(cruiseId: string) {
    return this.prisma.cruise.findUnique({ where: { id: cruiseId }, select: { status: true } });
  }

  findCruiseBySlug(slug: string) {
    return this.prisma.cruise.findUnique({ where: { slug }, select: { id: true, status: true } });
  }

  /** Experiencias (adicionais) que de fato pertencem a este cruzeiro, dentre os ids pedidos. */
  findExperiencesByIds(cruiseId: string, experienceIds: string[]) {
    if (experienceIds.length === 0) return Promise.resolve([]);
    return this.prisma.experience.findMany({
      where: { id: { in: experienceIds }, cruiseId },
    });
  }

  findExperienceById(experienceId: string) {
    return this.prisma.experience.findUnique({ where: { id: experienceId } });
  }

  /** Mesma soma de `sumActiveExperiencePartySize`, fora de uma transacao/lock — so para leitura de disponibilidade. */
  async sumActiveExperiencePartySizePlain(experienceId: string): Promise<number> {
    const result = await this.prisma.bookingExperience.aggregate({
      where: { experienceId, booking: { status: { in: ACTIVE_BOOKING_STATUSES } } },
      _sum: { partySize: true },
    });
    return result._sum.partySize ?? 0;
  }

  /**
   * `SELECT ... FOR UPDATE` de todas as Experience selecionadas de uma vez,
   * em ordem estavel de id — trava multiplos recursos na MESMA ordem em
   * toda chamada, o que evita deadlock entre duas `updateDetails`
   * concorrentes que selecionam experiencias sobrepostas em ordem diferente
   * (ver ADR-0014).
   */
  async lockExperiencesForUpdate(
    tx: Prisma.TransactionClient,
    experienceIds: string[],
  ): Promise<Array<{ id: string; capacity: number | null }>> {
    if (experienceIds.length === 0) return [];
    const sorted = [...new Set(experienceIds)].sort();
    return tx.$queryRaw<Array<{ id: string; capacity: number | null }>>(
      Prisma.sql`SELECT id, capacity FROM experiences WHERE id IN (${Prisma.join(sorted)}) ORDER BY id FOR UPDATE`,
    );
  }

  /**
   * Soma de `BookingExperience.partySize` de reservas ATIVAS (HELD,
   * PAYMENT_PENDING ou CONFIRMED — as mesmas que ocupam cabine, ver
   * ACTIVE_BOOKING_STATUSES) para cada experiencia pedida, EXCLUINDO a
   * propria reserva chamadora: `updateDetails` e um PUT idempotente que
   * SUBSTITUI as experiencias desta reserva, entao a selecao anterior dela
   * mesma nao deve contar contra o novo pedido.
   */
  async sumActiveExperiencePartySize(
    tx: Prisma.TransactionClient,
    experienceIds: string[],
    excludeBookingId: string,
  ): Promise<Map<string, number>> {
    if (experienceIds.length === 0) return new Map();
    const rows = await tx.bookingExperience.groupBy({
      by: ['experienceId'],
      where: {
        experienceId: { in: experienceIds },
        bookingId: { not: excludeBookingId },
        booking: { status: { in: ACTIVE_BOOKING_STATUSES } },
      },
      _sum: { partySize: true },
    });
    return new Map(rows.map((row) => [row.experienceId, row._sum.partySize ?? 0]));
  }

  /** Traduz o cupom (persistencia -> forma achatada do dominio) — ver CouponRecord.applicableCruiseIds. */
  async findCouponByCode(code: string): Promise<CouponRecord | null> {
    const coupon = await this.prisma.coupon.findUnique({
      where: { code },
      include: { applicableCruises: { select: { cruiseId: true } } },
    });
    if (!coupon) return null;
    const { applicableCruises, organizerId: _organizerId, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = coupon;
    return { ...rest, applicableCruiseIds: applicableCruises.map((c) => c.cruiseId) };
  }

  /**
   * Mesma traducao de `findCouponByCode`, por id — usada no checkout para
   * revalidar o cupom JA aplicado na reserva (`Booking.couponId`) contra o
   * estado ATUAL do cupom, nunca contra o que foi valido quando
   * `updateDetails` rodou (ver ADR-0012, "nao confiar no preco salvo").
   */
  async findCouponById(couponId: string): Promise<CouponRecord | null> {
    const coupon = await this.prisma.coupon.findUnique({
      where: { id: couponId },
      include: { applicableCruises: { select: { cruiseId: true } } },
    });
    if (!coupon) return null;
    const { applicableCruises, organizerId: _organizerId, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = coupon;
    return { ...rest, applicableCruiseIds: applicableCruises.map((c) => c.cruiseId) };
  }

  /** Precos JA CONGELADOS (`priceAtBooking`, ver ADR-0010) dos adicionais selecionados — nunca o preco atual da Experience. */
  async findBookingExperiencePrices(tx: Prisma.TransactionClient, bookingId: string): Promise<Prisma.Decimal[]> {
    const rows = await tx.bookingExperience.findMany({ where: { bookingId }, select: { priceAtBooking: true } });
    return rows.map((row) => row.priceAtBooking);
  }

  /**
   * Quantas vezes ESTE usuario ja usou este cupom — conta reservas que JA
   * FORAM confirmadas em algum momento (`confirmedAt` setado, nunca
   * limpo — ver confirmPayment/cancelBooking), nao o status ATUAL. Uma
   * reserva confirmada e depois cancelada continua contando como "usada":
   * senao um cupom de "primeira compra" poderia ser reaplicado indefinidas
   * vezes so cancelando e refazendo a reserva. Mesmo evento (confirmacao de
   * pagamento) que incrementa o `usedCount` global — ver
   * confirmPayment/incrementCouponUsage.
   */
  countUserCouponUsage(tx: Prisma.TransactionClient, userId: string, couponId: string) {
    return tx.booking.count({ where: { userId, couponId, confirmedAt: { not: null } } });
  }

  /**
   * `SELECT ... FOR UPDATE` — trava a linha da cabine ate o fim da
   * transacao chamadora. Uma segunda transacao concorrente tentando travar
   * a MESMA cabine bloqueia aqui ate a primeira commitar/abortar; so entao
   * ela le o estado (ja consolidado) e decide corretamente. E o ponto
   * central de serializacao contra overbooking (ver ADR-0009).
   */
  async lockCabinForUpdate(tx: Prisma.TransactionClient, cabinId: string): Promise<LockedCabin | null> {
    const rows = await tx.$queryRaw<LockedCabin[]>`
      SELECT id, status, "cabinCategoryId" FROM cabins WHERE id = ${cabinId} FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  /** Mesmo principio, para as transicoes que operam numa reserva ja existente. */
  async lockBookingForUpdate(tx: Prisma.TransactionClient, bookingId: string): Promise<LockedBooking | null> {
    const rows = await tx.$queryRaw<LockedBooking[]>`
      SELECT id, "userId", "cruiseId", "cabinId", "couponId", status, "holdExpiresAt"
      FROM bookings WHERE id = ${bookingId} FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  /**
   * Mesmo principio, pro cupom — trava antes de incrementar usedCount, para
   * a corrida nao perder um incremento (ver ADR-0010). So o `id`: quem
   * chama aqui (confirmPayment) ja validou o cupom inteiro em updateDetails,
   * so precisa confirmar que a linha ainda existe antes de incrementar.
   */
  async lockCouponForUpdate(tx: Prisma.TransactionClient, couponId: string): Promise<{ id: string } | null> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM coupons WHERE id = ${couponId} FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  incrementCouponUsage(tx: Prisma.TransactionClient, couponId: string) {
    return tx.coupon.update({ where: { id: couponId }, data: { usedCount: { increment: 1 } } });
  }

  /**
   * Expira qualquer hold/checkout desta cabine+cruzeiro cujo prazo ja
   * passou — chamado dentro da mesma transacao/lock de `holdCabin`, antes
   * de checar se ha uma reserva ativa. Sem isto, o indice unico parcial
   * (que so sabe status, nao tempo) bloquearia um novo hold pra sempre
   * depois que o anterior expirasse sem nunca ser fechado de fato.
   * Estado final e EXPIRED (nao CANCELLED) — ver ADR-0010.
   */
  expireStaleHold(tx: Prisma.TransactionClient, cabinId: string, cruiseId: string, now: Date) {
    return tx.booking.updateMany({
      where: {
        cabinId,
        cruiseId,
        status: { in: [BookingStatus.HELD, BookingStatus.PAYMENT_PENDING] },
        holdExpiresAt: { lte: now },
      },
      data: { status: BookingStatus.EXPIRED, cancelledAt: now, cancellationReason: 'Hold expirado automaticamente.' },
    });
  }

  findActiveBooking(tx: Prisma.TransactionClient, cabinId: string, cruiseId: string) {
    return tx.booking.findFirst({
      where: { cabinId, cruiseId, status: { in: ACTIVE_BOOKING_STATUSES } },
    });
  }

  findCruiseCabinPricing(tx: Prisma.TransactionClient, cruiseId: string, cabinCategoryId: string) {
    return tx.cruiseCabinPricing.findUnique({
      where: { cruiseId_cabinCategoryId: { cruiseId, cabinCategoryId } },
    });
  }

  createHold(
    tx: Prisma.TransactionClient,
    data: {
      userId: string;
      cruiseId: string;
      cabinId: string;
      subtotalAmount: Prisma.Decimal;
      discountAmount: Prisma.Decimal;
      feeAmount: Prisma.Decimal;
      totalAmount: Prisma.Decimal;
      currency: string;
      holdExpiresAt: Date;
      idempotencyKey?: string;
    },
  ) {
    return tx.booking.create({ data: { ...data, status: BookingStatus.HELD } });
  }

  updateStatus(tx: Prisma.TransactionClient, bookingId: string, data: Prisma.BookingUpdateInput) {
    return tx.booking.update({ where: { id: bookingId }, data });
  }

  /**
   * Substitui hospedes e adicionais por completo (semantica de PUT —
   * idempotente: reenviar a mesma lista produz o mesmo resultado) e grava o
   * novo preco calculado, tudo atomicamente. So chamado com a reserva ja
   * travada (`lockBookingForUpdate`) e com status HELD ja validado pelo
   * chamador (BookingLifecyclePolicy.assertCanEditDetails).
   */
  async replaceGuestsAndExperiences(
    tx: Prisma.TransactionClient,
    bookingId: string,
    params: {
      guests: Array<{
        fullName: string;
        documentType: 'PASSPORT' | 'NATIONAL_ID';
        documentNumber: string;
        birthDate?: Date;
        isPrimary: boolean;
      }>;
      experiences: Array<{ experienceId: string; priceAtBooking: Prisma.Decimal; partySize: number }>;
      couponId: string | null;
      pricing: {
        subtotalAmount: Prisma.Decimal;
        discountAmount: Prisma.Decimal;
        feeAmount: Prisma.Decimal;
        totalAmount: Prisma.Decimal;
      };
    },
  ) {
    await tx.bookingGuest.deleteMany({ where: { bookingId } });
    await tx.bookingExperience.deleteMany({ where: { bookingId } });

    if (params.guests.length > 0) {
      await tx.bookingGuest.createMany({
        data: params.guests.map((guest) => ({ ...guest, bookingId })),
      });
    }
    if (params.experiences.length > 0) {
      await tx.bookingExperience.createMany({
        data: params.experiences.map((experience) => ({ ...experience, bookingId })),
      });
    }

    return tx.booking.update({
      where: { id: bookingId },
      data: { couponId: params.couponId, ...params.pricing },
      include: { guests: true, experiences: true },
    });
  }

  createPayment(
    tx: Prisma.TransactionClient,
    data: { bookingId: string; method: PaymentMethod; amount: Prisma.Decimal; currency: string; simulatedTransactionId: string },
  ) {
    return tx.payment.create({ data: { ...data, status: PaymentStatus.PENDING } });
  }

  /** A tentativa de pagamento mais recente, qualquer status — usada para decidir se um checkout repetido e retry ou duplicata (ver ADR-0012). */
  findLatestPayment(tx: Prisma.TransactionClient, bookingId: string) {
    return tx.payment.findFirst({ where: { bookingId }, orderBy: { createdAt: 'desc' } });
  }

  /**
   * Aplica o desfecho do gateway (ver PaymentGateway.charge) numa tentativa
   * de pagamento — substitui o antigo `approvePayment`, generico o
   * suficiente para aprovar, recusar ou so atualizar a referencia da
   * transacao de um pagamento que continua PENDING (boleto gerado, timeout).
   */
  updatePaymentOutcome(
    tx: Prisma.TransactionClient,
    paymentId: string,
    data: { status: PaymentStatus; simulatedTransactionId?: string; paidAt?: Date; failureReason?: string },
  ) {
    return tx.payment.update({ where: { id: paymentId }, data });
  }
}
