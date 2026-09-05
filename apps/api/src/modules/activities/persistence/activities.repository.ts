import { Injectable } from '@nestjs/common';
import { ActivityReservationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import type { TimeWindow } from '../domain/activity-scheduling.policy';
import { diningSlotWindowOn } from '../domain/dining-schedule.util';

interface LockedEvent {
  id: string;
  cruiseId: string;
  capacity: number | null;
  startAt: Date;
  endAt: Date;
  title: string;
}

interface LockedDiningSlot {
  id: string;
  restaurantId: string;
  capacity: number;
  startTime: Date;
  endTime: Date;
  label: string;
}

const ACTIVE = ActivityReservationStatus.CONFIRMED;

/**
 * Toda escrita de reserva de atividade roda dentro de uma
 * `Prisma.TransactionClient` (`tx`), nunca do client "solto" —
 * `ActivitiesService` abre a transacao e passa `tx` pra cada chamada aqui.
 * Ver ADR-0014 para o porque (mesmo principio de ADR-0009/0010/0012/0013).
 */
@Injectable()
export class ActivitiesRepository {
  constructor(private readonly prisma: PrismaService) {}

  // --- Reserva (posse + estado da viagem) ---------------------------------

  /** Precisa ser do usuario E estar CONFIRMED — "adicionar a sua viagem" so faz sentido para uma viagem de verdade. */
  findConfirmedBookingForUser(bookingId: string, userId: string) {
    return this.prisma.booking.findFirst({
      where: { id: bookingId, userId, status: 'CONFIRMED' },
      select: {
        id: true,
        cruiseId: true,
        cruise: { select: { embarkationDate: true, disembarkationDate: true, shipId: true } },
      },
    });
  }

  /** Todas as janelas de tempo JA ocupadas por esta reserva (eventos + jantares confirmados) — para checar conflito de horario. */
  async findBookingTimeWindows(tx: Prisma.TransactionClient, bookingId: string): Promise<TimeWindow[]> {
    const [events, dinings] = await Promise.all([
      tx.eventReservation.findMany({
        where: { bookingId, status: ACTIVE },
        include: { event: { select: { title: true, startAt: true, endAt: true } } },
      }),
      tx.diningReservation.findMany({
        where: { bookingId, status: ACTIVE },
        include: {
          diningSlot: { select: { startTime: true, endTime: true, label: true, restaurant: { select: { name: true } } } },
        },
      }),
    ]);

    const eventWindows: TimeWindow[] = events.map((r) => ({
      start: r.event.startAt,
      end: r.event.endAt,
      label: r.event.title,
    }));
    const diningWindows: TimeWindow[] = dinings.map((r) => {
      const window = diningSlotWindowOn(r.reservationDate, r.diningSlot.startTime, r.diningSlot.endTime);
      return { ...window, label: `${r.diningSlot.restaurant.name} (${r.diningSlot.label})` };
    });
    return [...eventWindows, ...diningWindows];
  }

  // --- Eventos --------------------------------------------------------------

  async lockEventForUpdate(tx: Prisma.TransactionClient, eventId: string): Promise<LockedEvent | null> {
    const rows = await tx.$queryRaw<LockedEvent[]>`
      SELECT id, "cruiseId", capacity, "startAt", "endAt", title FROM events WHERE id = ${eventId} FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  async sumActiveEventPartySize(tx: Prisma.TransactionClient, eventId: string): Promise<number> {
    const result = await tx.eventReservation.aggregate({
      where: { eventId, status: ACTIVE },
      _sum: { partySize: true },
    });
    return result._sum.partySize ?? 0;
  }

  findEventReservation(tx: Prisma.TransactionClient, eventId: string, bookingId: string) {
    return tx.eventReservation.findUnique({ where: { eventId_bookingId: { eventId, bookingId } } });
  }

  /** So chamado quando a linha nao existe ou esta CANCELLED (ver ActivitiesService — nunca sobrescreve uma reserva CONFIRMED). */
  upsertEventReservation(tx: Prisma.TransactionClient, params: { eventId: string; bookingId: string; partySize: number }) {
    return tx.eventReservation.upsert({
      where: { eventId_bookingId: { eventId: params.eventId, bookingId: params.bookingId } },
      create: { ...params, status: ACTIVE },
      update: { partySize: params.partySize, status: ACTIVE, cancelledAt: null },
    });
  }

  cancelEventReservation(tx: Prisma.TransactionClient, id: string) {
    return tx.eventReservation.update({
      where: { id },
      data: { status: ActivityReservationStatus.CANCELLED, cancelledAt: new Date() },
    });
  }

  /**
   * Cascata de cancelamento de RESERVA (nao de uma atividade isolada) —
   * chamado quando a `Booking` inteira e cancelada (pelo passageiro ou por
   * um admin), pra fechar as reservas de evento/restaurante que ficariam
   * CONFIRMED presas pra sempre e continuariam contando contra a capacidade
   * do evento/horario indefinidamente. Bulk (`updateMany`, nao um loop),
   * mesmo principio de `AdminCatalogService.cancelCruise` pros tickets.
   */
  async cancelReservationsForBookings(tx: Prisma.TransactionClient, bookingIds: string[]): Promise<void> {
    if (bookingIds.length === 0) return;
    await tx.eventReservation.updateMany({
      where: { bookingId: { in: bookingIds }, status: ACTIVE },
      data: { status: ActivityReservationStatus.CANCELLED, cancelledAt: new Date() },
    });
    await tx.diningReservation.updateMany({
      where: { bookingId: { in: bookingIds }, status: ACTIVE },
      data: { status: ActivityReservationStatus.CANCELLED, cancelledAt: new Date() },
    });
  }

  findEventReservationById(id: string) {
    return this.prisma.eventReservation.findUnique({ where: { id } });
  }

  listMyEventReservations(userId: string) {
    return this.prisma.eventReservation.findMany({
      where: { booking: { userId }, status: ACTIVE },
      include: { event: { include: { venue: true, artist: true } }, booking: { select: { id: true, cruiseId: true } } },
      orderBy: { event: { startAt: 'asc' } },
    });
  }

  // --- Restaurantes / dining slots -------------------------------------------

  async lockDiningSlotForUpdate(tx: Prisma.TransactionClient, diningSlotId: string): Promise<LockedDiningSlot | null> {
    const rows = await tx.$queryRaw<LockedDiningSlot[]>`
      SELECT id, "restaurantId", capacity, "startTime", "endTime", label FROM dining_slots WHERE id = ${diningSlotId} FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  findDiningSlotWithRestaurant(diningSlotId: string) {
    return this.prisma.diningSlot.findUnique({
      where: { id: diningSlotId },
      include: { restaurant: { select: { id: true, name: true, shipId: true } } },
    });
  }

  async sumActiveDiningPartySize(tx: Prisma.TransactionClient, diningSlotId: string, reservationDate: Date): Promise<number> {
    const result = await tx.diningReservation.aggregate({
      where: { diningSlotId, reservationDate, status: ACTIVE },
      _sum: { partySize: true },
    });
    return result._sum.partySize ?? 0;
  }

  findDiningReservation(tx: Prisma.TransactionClient, diningSlotId: string, bookingId: string, reservationDate: Date) {
    return tx.diningReservation.findUnique({
      where: { diningSlotId_bookingId_reservationDate: { diningSlotId, bookingId, reservationDate } },
    });
  }

  /** So chamado quando a linha nao existe ou esta CANCELLED (ver ActivitiesService — nunca sobrescreve uma reserva CONFIRMED). */
  upsertDiningReservation(
    tx: Prisma.TransactionClient,
    params: { diningSlotId: string; bookingId: string; partySize: number; reservationDate: Date },
  ) {
    return tx.diningReservation.upsert({
      where: {
        diningSlotId_bookingId_reservationDate: {
          diningSlotId: params.diningSlotId,
          bookingId: params.bookingId,
          reservationDate: params.reservationDate,
        },
      },
      create: { ...params, status: ACTIVE },
      update: { partySize: params.partySize, status: ACTIVE, cancelledAt: null },
    });
  }

  cancelDiningReservation(tx: Prisma.TransactionClient, id: string) {
    return tx.diningReservation.update({
      where: { id },
      data: { status: ActivityReservationStatus.CANCELLED, cancelledAt: new Date() },
    });
  }

  findDiningReservationById(id: string) {
    return this.prisma.diningReservation.findUnique({ where: { id } });
  }

  listMyDiningReservations(userId: string) {
    return this.prisma.diningReservation.findMany({
      where: { booking: { userId }, status: ACTIVE },
      include: { diningSlot: { include: { restaurant: true } }, booking: { select: { id: true, cruiseId: true } } },
      orderBy: { reservationDate: 'asc' },
    });
  }

  // --- Cadastro de horarios de restaurante (organizador) ---------------------

  createDiningSlot(restaurantId: string, data: { label: string; startTime: Date; endTime: Date; capacity: number }) {
    return this.prisma.diningSlot.create({ data: { restaurantId, ...data } });
  }

  updateDiningSlot(id: string, data: Partial<{ label: string; startTime: Date; endTime: Date; capacity: number }>) {
    return this.prisma.diningSlot.update({ where: { id }, data });
  }

  findDiningSlotForOwnership(id: string) {
    return this.prisma.diningSlot.findUnique({
      where: { id },
      include: { restaurant: { select: { shipId: true } } },
    });
  }
}
