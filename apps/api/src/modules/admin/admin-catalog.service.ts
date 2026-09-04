import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BookingStatus, CruiseStatus, Prisma, TicketStatus } from '@prisma/client';
import type {
  AdminCabinsQuery,
  AdminCruisesQuery,
  AdminEventsQuery,
  AdminExperiencesQuery,
  AdminRestaurantsQuery,
  AdminShipsQuery,
} from '@seapass/contracts';
import { PrismaService } from '../../database/prisma/prisma.service';
import { toPageResult, toSkipTake } from '../catalog/domain/pagination';
import { AuditLogService } from '../../audit/audit-log.service';
import { DomainEvent } from '../../domain-events/domain-events';

/** Estados de reserva que ainda "existem" quando o cruzeiro e cancelado — os terminais (ja resolvidos) nao precisam de nada. */
const CANCELLABLE_BOOKING_STATUSES: BookingStatus[] = [BookingStatus.HELD, BookingStatus.PAYMENT_PENDING, BookingStatus.CONFIRMED];

/** Leitura global (sem escopo de organizador) + acoes administrativas do catalogo — ver ADR-0018. */
@Injectable()
export class AdminCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // --- Cruzeiros ---

  async listCruises(query: AdminCruisesQuery) {
    const where: Prisma.CruiseWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.organizerId ? { organizerId: query.organizerId } : {}),
      ...(query.q ? { title: { contains: query.q, mode: 'insensitive' } } : {}),
    };
    const { skip, take } = toSkipTake(query.page, query.pageSize);
    const [data, total] = await Promise.all([
      this.prisma.cruise.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          ship: { select: { name: true } },
          organizer: { select: { id: true, name: true } },
          _count: { select: { bookings: true } },
        },
      }),
      this.prisma.cruise.count({ where }),
    ]);
    return toPageResult(data, total, query.page, query.pageSize);
  }

  async getCruise(id: string) {
    const cruise = await this.prisma.cruise.findUnique({
      where: { id },
      include: {
        ship: { select: { id: true, name: true } },
        organizer: { select: { id: true, name: true } },
        embarkationPort: true,
        disembarkationPort: true,
        cabinPricings: { include: { cabinCategory: { select: { name: true } } } },
        _count: { select: { bookings: true, events: true, experiences: true } },
      },
    });
    if (!cruise) {
      throw new NotFoundException('Cruzeiro nao encontrado.');
    }
    return cruise;
  }

  /**
   * Cancelar um cruzeiro nao e so uma flag no proprio Cruise — antes desta revisao de hardening
   * (ADR-0020) so mudava `Cruise.status`, deixando passageiros com reservas `CONFIRMED` e tickets
   * `ISSUED` pra uma viagem que a plataforma acabou de cancelar (nem notificacao, nem estorno
   * "logico" da reserva). Agora cascade-cancela toda reserva ainda nao-terminal (HELD/
   * PAYMENT_PENDING/CONFIRMED) e os tickets ja emitidos dela, tudo na MESMA transacao do cruzeiro
   * — e emite `BOOKING_CANCELLED` por reserva afetada depois de commitar (ver ADR-0019: nunca
   * dentro da transacao), pra cada passageiro receber a notificacao de cancelamento de verdade.
   */
  async cancelCruise(actorUserId: string, id: string, reason?: string) {
    const cruise = await this.prisma.cruise.findUnique({ where: { id } });
    if (!cruise) {
      throw new NotFoundException('Cruzeiro nao encontrado.');
    }

    const cancellationReason = reason?.trim() || 'Cruzeiro cancelado pela administracao da plataforma.';

    const { updated, affectedBookingIds } = await this.prisma.$transaction(async (tx) => {
      const affectedBookings = await tx.booking.findMany({
        where: { cruiseId: id, status: { in: CANCELLABLE_BOOKING_STATUSES } },
        select: { id: true },
      });

      const result = await tx.cruise.update({ where: { id }, data: { status: CruiseStatus.CANCELLED } });

      if (affectedBookings.length > 0) {
        await tx.booking.updateMany({
          where: { id: { in: affectedBookings.map((b) => b.id) } },
          data: { status: BookingStatus.CANCELLED, cancelledAt: new Date(), cancellationReason },
        });
        // Bulk direto (nao um loop por reserva) — evita N+1 num cruzeiro com dezenas de reservas.
        await tx.ticket.updateMany({
          where: { status: TicketStatus.ISSUED, bookingGuest: { booking: { cruiseId: id } } },
          data: { status: TicketStatus.CANCELLED },
        });
      }

      return { updated: result, affectedBookingIds: affectedBookings.map((b) => b.id) };
    });

    await this.auditLog.record({
      actorUserId,
      action: 'cruise.admin_cancelled',
      entityType: 'Cruise',
      entityId: id,
      metadata: { reason: reason ?? null, affectedBookings: affectedBookingIds.length },
    });
    for (const bookingId of affectedBookingIds) {
      this.eventEmitter.emit(DomainEvent.BOOKING_CANCELLED, {
        bookingId,
        reason: cancellationReason,
        cancelledBy: 'ADMIN',
      });
    }

    return updated;
  }

  // --- Navios ---

  async listShips(query: AdminShipsQuery) {
    const where: Prisma.ShipWhereInput = {
      deletedAt: null,
      ...(query.organizerId ? { organizerId: query.organizerId } : {}),
      ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
    };
    const { skip, take } = toSkipTake(query.page, query.pageSize);
    const [data, total] = await Promise.all([
      this.prisma.ship.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { organizer: { select: { id: true, name: true } }, _count: { select: { cruises: true, decks: true } } },
      }),
      this.prisma.ship.count({ where }),
    ]);
    return toPageResult(data, total, query.page, query.pageSize);
  }

  async getShip(id: string) {
    const ship = await this.prisma.ship.findUnique({
      where: { id },
      include: {
        organizer: { select: { id: true, name: true } },
        decks: { orderBy: { number: 'asc' }, include: { _count: { select: { cabins: true } } } },
        _count: { select: { cruises: true, venues: true, restaurants: true } },
      },
    });
    if (!ship) {
      throw new NotFoundException('Navio nao encontrado.');
    }
    return ship;
  }

  // --- Cabines ---

  async listCabins(query: AdminCabinsQuery) {
    const where: Prisma.CabinWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.shipId ? { deck: { shipId: query.shipId } } : {}),
      ...(query.q ? { code: { contains: query.q, mode: 'insensitive' } } : {}),
    };
    const { skip, take } = toSkipTake(query.page, query.pageSize);
    const [data, total] = await Promise.all([
      this.prisma.cabin.findMany({
        where,
        orderBy: { code: 'asc' },
        skip,
        take,
        include: {
          cabinCategory: { select: { name: true, maxOccupancy: true } },
          deck: { select: { id: true, name: true, ship: { select: { id: true, name: true } } } },
        },
      }),
      this.prisma.cabin.count({ where }),
    ]);
    return toPageResult(data, total, query.page, query.pageSize);
  }

  async getCabin(id: string) {
    const cabin = await this.prisma.cabin.findUnique({
      where: { id },
      include: {
        cabinCategory: true,
        deck: { select: { id: true, name: true, ship: { select: { id: true, name: true } } } },
        bookings: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { id: true, status: true, createdAt: true, cruise: { select: { title: true } } },
        },
      },
    });
    if (!cabin) {
      throw new NotFoundException('Cabine nao encontrada.');
    }
    return cabin;
  }

  // --- Eventos ---

  async listEvents(query: AdminEventsQuery) {
    const where: Prisma.EventWhereInput = {
      ...(query.cruiseId ? { cruiseId: query.cruiseId } : {}),
      ...(query.q ? { title: { contains: query.q, mode: 'insensitive' } } : {}),
    };
    const { skip, take } = toSkipTake(query.page, query.pageSize);
    const [data, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        orderBy: { startAt: 'desc' },
        skip,
        take,
        include: {
          venue: { select: { name: true } },
          artist: { select: { name: true } },
          cruise: { select: { id: true, title: true } },
          _count: { select: { reservations: true } },
        },
      }),
      this.prisma.event.count({ where }),
    ]);
    return toPageResult(data, total, query.page, query.pageSize);
  }

  async getEvent(id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: {
        venue: true,
        artist: true,
        cruise: { select: { id: true, title: true, organizer: { select: { id: true, name: true } } } },
        _count: { select: { reservations: true } },
      },
    });
    if (!event) {
      throw new NotFoundException('Evento nao encontrado.');
    }
    return event;
  }

  // --- Restaurantes ---

  async listRestaurants(query: AdminRestaurantsQuery) {
    const where: Prisma.RestaurantWhereInput = {
      ...(query.shipId ? { shipId: query.shipId } : {}),
      ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
    };
    const { skip, take } = toSkipTake(query.page, query.pageSize);
    const [data, total] = await Promise.all([
      this.prisma.restaurant.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take,
        include: { ship: { select: { id: true, name: true } }, _count: { select: { diningSlots: true } } },
      }),
      this.prisma.restaurant.count({ where }),
    ]);
    return toPageResult(data, total, query.page, query.pageSize);
  }

  async getRestaurant(id: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
      include: { ship: { select: { id: true, name: true } }, diningSlots: true },
    });
    if (!restaurant) {
      throw new NotFoundException('Restaurante nao encontrado.');
    }
    return restaurant;
  }

  // --- Experiencias ---

  async listExperiences(query: AdminExperiencesQuery) {
    const where: Prisma.ExperienceWhereInput = {
      ...(query.cruiseId ? { cruiseId: query.cruiseId } : {}),
      ...(query.q ? { title: { contains: query.q, mode: 'insensitive' } } : {}),
    };
    const { skip, take } = toSkipTake(query.page, query.pageSize);
    const [data, total] = await Promise.all([
      this.prisma.experience.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { cruise: { select: { id: true, title: true } }, _count: { select: { bookings: true } } },
      }),
      this.prisma.experience.count({ where }),
    ]);
    return toPageResult(data, total, query.page, query.pageSize);
  }

  async getExperience(id: string) {
    const experience = await this.prisma.experience.findUnique({
      where: { id },
      include: { cruise: { select: { id: true, title: true, organizer: { select: { id: true, name: true } } } } },
    });
    if (!experience) {
      throw new NotFoundException('Experiencia nao encontrada.');
    }
    return experience;
  }
}
