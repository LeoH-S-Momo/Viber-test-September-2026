import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, RoleKey } from '@prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { requireOrganizerId } from '../../../common/utils/auth-context';
import { DomainEvent } from '../../../domain-events/domain-events';
import type { AuthenticatedUser } from '../../auth/types/jwt-payload';
import { ActivityCapacityPolicy } from '../domain/activity-capacity.policy';
import { ActivitySchedulingPolicy } from '../domain/activity-scheduling.policy';
import { assertDateWithinCruise, diningSlotWindowOn } from '../domain/dining-schedule.util';
import { ActivitiesRepository } from '../persistence/activities.repository';

function normalizeDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * "Um usuário deverá conseguir adicionar essas atividades à sua viagem" —
 * ver docs/architecture/decisions/0014-onboard-activity-reservations.md.
 * Cada reserva (evento ou jantar) roda numa transacao que trava a linha do
 * RECURSO compartilhado (`Event`/`DiningSlot`, `SELECT ... FOR UPDATE` —
 * mesmo principio de ADR-0009/0010/0012/0013) antes de somar as reservas
 * ativas e decidir — nunca confia numa leitura solta seguida de escrita.
 */
@Injectable()
export class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activitiesRepository: ActivitiesRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private async requireOwnedConfirmedBooking(bookingId: string, userId: string) {
    const booking = await this.activitiesRepository.findConfirmedBookingForUser(bookingId, userId);
    if (!booking) {
      // 404, nao 403 — nao revela se a reserva existe pra quem nao e dono (ver ADR-0005), e o
      // mesmo 404 tambem cobre "existe mas nao esta CONFIRMED ainda" de proposito: so faz
      // sentido "adicionar a viagem" depois que a viagem em si esta confirmada.
      throw new NotFoundException('Reserva confirmada nao encontrada.');
    }
    return booking;
  }

  // ==========================================================================
  // EVENTOS
  // ==========================================================================

  async getEventAvailability(eventId: string) {
    return this.prisma.$transaction(async (tx) => {
      const event = await this.activitiesRepository.lockEventForUpdate(tx, eventId);
      if (!event) throw new NotFoundException('Evento nao encontrado.');
      const reserved = await this.activitiesRepository.sumActiveEventPartySize(tx, eventId);
      return { capacity: event.capacity, reserved, available: event.capacity === null ? null : event.capacity - reserved };
    });
  }

  async reserveEvent(userId: string, bookingId: string, eventId: string, partySize: number) {
    const { reservation, isNew } = await this.prisma.$transaction(async (tx) => {
      const booking = await this.requireOwnedConfirmedBooking(bookingId, userId);

      const event = await this.activitiesRepository.lockEventForUpdate(tx, eventId);
      if (!event) {
        throw new NotFoundException('Evento nao encontrado.');
      }
      if (event.cruiseId !== booking.cruiseId) {
        throw new ConflictException('Este evento nao pertence ao cruzeiro da sua reserva.');
      }

      const existing = await this.activitiesRepository.findEventReservation(tx, eventId, bookingId);
      if (existing && existing.status === 'CONFIRMED') {
        if (existing.partySize === partySize) {
          return { reservation: existing, isNew: false }; // retry idempotente — mesma reserva, nada muda.
        }
        throw new ConflictException(
          'Você já reservou este evento — cancele a reserva atual antes de mudar o número de pessoas.',
        );
      }

      const alreadyReserved = await this.activitiesRepository.sumActiveEventPartySize(tx, eventId);
      ActivityCapacityPolicy.assertHasCapacity({ capacity: event.capacity, alreadyReserved, partySize });

      const windows = await this.activitiesRepository.findBookingTimeWindows(tx, bookingId);
      ActivitySchedulingPolicy.assertNoConflict(windows, { start: event.startAt, end: event.endAt, label: event.title });

      const upserted = await this.activitiesRepository.upsertEventReservation(tx, { eventId, bookingId, partySize });
      return { reservation: upserted, isNew: true };
    });

    // So emite pra uma reserva de verdade (nao o retry idempotente que so devolveu o que ja existia).
    if (isNew) {
      this.eventEmitter.emit(DomainEvent.EVENT_BOOKED, { bookingId, eventId });
    }
    return reservation;
  }

  async cancelEventReservation(userId: string, bookingId: string, reservationId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.requireOwnedConfirmedBooking(bookingId, userId);
      const reservation = await this.activitiesRepository.findEventReservationById(reservationId);
      if (!reservation || reservation.bookingId !== bookingId) {
        throw new NotFoundException('Reserva de evento nao encontrada.');
      }
      if (reservation.status === 'CANCELLED') {
        return reservation; // idempotente
      }
      return this.activitiesRepository.cancelEventReservation(tx, reservationId);
    });
  }

  /**
   * Chamado por quem cancela a RESERVA inteira (BookingsService/AdminSalesService), na MESMA
   * transacao — nunca sozinho. Aceita uma lista pra tambem servir o cascade de
   * AdminCatalogService.cancelCruise (varias reservas de uma vez).
   */
  cancelReservationsForBookings(tx: Prisma.TransactionClient, bookingIds: string[]) {
    return this.activitiesRepository.cancelReservationsForBookings(tx, bookingIds);
  }

  listMyEventReservations(userId: string) {
    return this.activitiesRepository.listMyEventReservations(userId);
  }

  // ==========================================================================
  // RESTAURANTES / DINING SLOTS
  // ==========================================================================

  async getDiningAvailability(diningSlotId: string, date: Date) {
    const reservationDate = normalizeDateOnly(date);
    return this.prisma.$transaction(async (tx) => {
      const slot = await this.activitiesRepository.lockDiningSlotForUpdate(tx, diningSlotId);
      if (!slot) throw new NotFoundException('Horário de restaurante não encontrado.');
      const reserved = await this.activitiesRepository.sumActiveDiningPartySize(tx, diningSlotId, reservationDate);
      return { capacity: slot.capacity, reserved, available: slot.capacity - reserved };
    });
  }

  async reserveDining(userId: string, bookingId: string, diningSlotId: string, partySize: number, date: Date) {
    const reservationDate = normalizeDateOnly(date);

    return this.prisma.$transaction(async (tx) => {
      const booking = await this.requireOwnedConfirmedBooking(bookingId, userId);
      assertDateWithinCruise(reservationDate, booking.cruise.embarkationDate, booking.cruise.disembarkationDate);

      const slot = await this.activitiesRepository.lockDiningSlotForUpdate(tx, diningSlotId);
      if (!slot) {
        throw new NotFoundException('Horário de restaurante não encontrado.');
      }
      const restaurant = await this.activitiesRepository.findDiningSlotWithRestaurant(diningSlotId);
      if (!restaurant || restaurant.restaurant.shipId !== booking.cruise.shipId) {
        throw new ConflictException('Este restaurante não pertence ao navio do seu cruzeiro.');
      }

      const existing = await this.activitiesRepository.findDiningReservation(tx, diningSlotId, bookingId, reservationDate);
      if (existing && existing.status === 'CONFIRMED') {
        if (existing.partySize === partySize) {
          return existing;
        }
        throw new ConflictException(
          'Você já reservou este horário nesta data — cancele a reserva atual antes de mudar o número de pessoas.',
        );
      }

      const alreadyReserved = await this.activitiesRepository.sumActiveDiningPartySize(tx, diningSlotId, reservationDate);
      ActivityCapacityPolicy.assertHasCapacity({ capacity: slot.capacity, alreadyReserved, partySize });

      const windows = await this.activitiesRepository.findBookingTimeWindows(tx, bookingId);
      const candidate = diningSlotWindowOn(reservationDate, slot.startTime, slot.endTime);
      ActivitySchedulingPolicy.assertNoConflict(windows, {
        ...candidate,
        label: `${restaurant.restaurant.name} (${slot.label})`,
      });

      return this.activitiesRepository.upsertDiningReservation(tx, { diningSlotId, bookingId, partySize, reservationDate });
    });
  }

  async cancelDiningReservation(userId: string, bookingId: string, reservationId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.requireOwnedConfirmedBooking(bookingId, userId);
      const reservation = await this.activitiesRepository.findDiningReservationById(reservationId);
      if (!reservation || reservation.bookingId !== bookingId) {
        throw new NotFoundException('Reserva de restaurante não encontrada.');
      }
      if (reservation.status === 'CANCELLED') {
        return reservation;
      }
      return this.activitiesRepository.cancelDiningReservation(tx, reservationId);
    });
  }

  listMyDiningReservations(userId: string) {
    return this.activitiesRepository.listMyDiningReservations(userId);
  }

  // ==========================================================================
  // CADASTRO DE HORARIOS (organizador — DiningSlot nao tinha nenhum CRUD ate aqui)
  // ==========================================================================

  async createDiningSlot(
    user: AuthenticatedUser,
    restaurantId: string,
    data: { label: string; startTime: Date; endTime: Date; capacity: number },
  ) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN);
    await this.assertRestaurantOwnedByOrganizer(restaurantId, organizerId);
    return this.activitiesRepository.createDiningSlot(restaurantId, data);
  }

  async updateDiningSlot(
    user: AuthenticatedUser,
    diningSlotId: string,
    data: Partial<{ label: string; startTime: Date; endTime: Date; capacity: number }>,
  ) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN);
    const slot = await this.activitiesRepository.findDiningSlotForOwnership(diningSlotId);
    if (!slot) {
      throw new NotFoundException('Horário de restaurante não encontrado.');
    }
    await this.assertShipOwnedByOrganizer(slot.restaurant.shipId, organizerId);
    return this.activitiesRepository.updateDiningSlot(diningSlotId, data);
  }

  private async assertRestaurantOwnedByOrganizer(restaurantId: string, organizerId: string): Promise<void> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { shipId: true },
    });
    if (!restaurant) {
      throw new NotFoundException('Restaurante não encontrado.');
    }
    await this.assertShipOwnedByOrganizer(restaurant.shipId, organizerId);
  }

  /** 404, nao 403 (ver ADR-0005) — nao confirma a outro organizador que o navio existe. */
  private async assertShipOwnedByOrganizer(shipId: string, organizerId: string): Promise<void> {
    const ship = await this.prisma.ship.findUnique({ where: { id: shipId }, select: { organizerId: true } });
    if (!ship || ship.organizerId !== organizerId) {
      throw new NotFoundException('Navio não encontrado.');
    }
  }
}
