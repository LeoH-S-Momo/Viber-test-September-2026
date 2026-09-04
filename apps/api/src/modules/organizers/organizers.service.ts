import { Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, Prisma, RoleKey } from '@prisma/client';
import type {
  InviteStaffInput,
  OrganizerBookingsQuery,
  OrganizerDashboardQuery,
  OrganizerPassengersQuery,
} from '@seapass/contracts';
import { PrismaService } from '../../database/prisma/prisma.service';
import { toPageResult, toSkipTake } from '../catalog/domain/pagination';
import { UsersService } from '../users/users.service';

/** Estados que ocupam uma cabine — usados tanto pra ocupacao quanto pro filtro padrao de "reservas ativas". */
const ACTIVE_BOOKING_STATUSES: BookingStatus[] = [
  BookingStatus.HELD,
  BookingStatus.PAYMENT_PENDING,
  BookingStatus.CONFIRMED,
];

@Injectable()
export class OrganizersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  async inviteStaff(organizerId: string, input: InviteStaffInput) {
    const passwordHash = await this.usersService.hashPassword(input.password);
    return this.usersService.createUserWithRole({
      email: input.email,
      passwordHash,
      fullName: input.fullName,
      roleKey: RoleKey.ORGANIZER_STAFF,
      organizerId,
    });
  }

  private async requireOwnedCruise(organizerId: string, cruiseId: string) {
    const cruise = await this.prisma.cruise.findUnique({ where: { id: cruiseId } });
    if (!cruise || cruise.organizerId !== organizerId) {
      throw new NotFoundException('Cruzeiro nao encontrado.');
    }
    return cruise;
  }

  async getOccupancy(organizerId: string, cruiseId: string) {
    const cruise = await this.requireOwnedCruise(organizerId, cruiseId);

    const categories = await this.prisma.cabinCategory.findMany({
      where: { shipId: cruise.shipId },
      include: { cabins: { select: { id: true } } },
    });

    return Promise.all(
      categories.map(async (category) => {
        const cabinIds = category.cabins.map((cabin) => cabin.id);
        const booked =
          cabinIds.length === 0
            ? 0
            : await this.prisma.booking.count({
                where: {
                  cruiseId,
                  cabinId: { in: cabinIds },
                  status: { in: ['HELD', 'PAYMENT_PENDING', 'CONFIRMED'] },
                },
              });

        return {
          categoryId: category.id,
          categoryName: category.name,
          totalCabins: cabinIds.length,
          booked,
          available: cabinIds.length - booked,
        };
      }),
    );
  }

  async getSales(organizerId: string, cruiseId: string) {
    await this.requireOwnedCruise(organizerId, cruiseId);

    const [confirmedCount, revenue] = await Promise.all([
      this.prisma.booking.count({ where: { cruiseId, status: 'CONFIRMED' } }),
      this.prisma.booking.aggregate({
        where: { cruiseId, status: 'CONFIRMED' },
        _sum: { totalAmount: true },
      }),
    ]);

    return {
      confirmedBookings: confirmedCount,
      totalRevenue: revenue._sum.totalAmount?.toString() ?? '0',
    };
  }

  /**
   * Reservas de TODOS os cruzeiros do organizador — o filtro de tenant vai
   * dentro do proprio `where` (`cruise: { organizerId }`), nunca aplicado
   * depois de buscar: mesmo que `cruiseId` pedido pertença a outro
   * organizador, a condição combinada nunca devolve as reservas dele (ver
   * ADR-0016). `requireOwnedCruise` ainda roda antes, so pra devolver um 404
   * explicito em vez de uma lista vazia silenciosa quando o id é alheio.
   */
  async listBookings(organizerId: string, query: OrganizerBookingsQuery) {
    if (query.cruiseId) {
      await this.requireOwnedCruise(organizerId, query.cruiseId);
    }

    const where: Prisma.BookingWhereInput = {
      cruise: { organizerId },
      ...(query.cruiseId ? { cruiseId: query.cruiseId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const { skip, take } = toSkipTake(query.page, query.pageSize);
    const [data, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          cruise: { select: { id: true, title: true, slug: true } },
          cabin: { select: { code: true, cabinCategory: { select: { name: true } } } },
          user: { select: { fullName: true, email: true } },
          guests: { select: { id: true, fullName: true, isPrimary: true } },
        },
      }),
      this.prisma.booking.count({ where }),
    ]);

    return toPageResult(data, total, query.page, query.pageSize);
  }

  /**
   * Passageiros (BookingGuest) de todas as reservas do organizador — mesmo
   * principio de isolamento de `listBookings`: o filtro de tenant esta
   * dentro do `where`, nunca aplicado depois.
   */
  async listPassengers(organizerId: string, query: OrganizerPassengersQuery) {
    if (query.cruiseId) {
      await this.requireOwnedCruise(organizerId, query.cruiseId);
    }

    const where: Prisma.BookingGuestWhereInput = {
      booking: {
        cruise: { organizerId },
        ...(query.cruiseId ? { cruiseId: query.cruiseId } : {}),
      },
      ...(query.q ? { fullName: { contains: query.q, mode: 'insensitive' } } : {}),
    };

    const { skip, take } = toSkipTake(query.page, query.pageSize);
    const [data, total] = await Promise.all([
      this.prisma.bookingGuest.findMany({
        where,
        orderBy: { fullName: 'asc' },
        skip,
        take,
        include: {
          booking: {
            select: {
              id: true,
              status: true,
              cruise: { select: { id: true, title: true } },
              cabin: { select: { code: true } },
              user: { select: { email: true } },
            },
          },
        },
      }),
      this.prisma.bookingGuest.count({ where }),
    ]);

    return toPageResult(data, total, query.page, query.pageSize);
  }

  /**
   * O painel do organizador. `cruiseIds` e sempre derivado de `organizerId`
   * primeiro (todos os cruzeiros do organizador, ou so um — ja validado por
   * `requireOwnedCruise`) — nunca de um `cruiseId` cru vindo da query, o que
   * garante isolamento por construcao mesmo se este metodo crescer mais
   * filtros no futuro (ver ADR-0016).
   */
  async getDashboard(organizerId: string, query: OrganizerDashboardQuery) {
    const cruiseIds = query.cruiseId
      ? [(await this.requireOwnedCruise(organizerId, query.cruiseId)).id]
      : (await this.prisma.cruise.findMany({ where: { organizerId }, select: { id: true } })).map((c) => c.id);

    if (cruiseIds.length === 0) {
      return this.emptyDashboard();
    }

    const period = { from: query.from, to: query.to };
    const confirmedAtRange = this.dateRangeFilter(period);
    const createdAtRange = this.dateRangeFilter(period);
    const cancelledAtRange = this.dateRangeFilter(period);

    const [confirmedBookings, bookingsCount, cancellations, cruises] = await Promise.all([
      this.prisma.booking.findMany({
        where: { cruiseId: { in: cruiseIds }, status: BookingStatus.CONFIRMED, ...(confirmedAtRange ? { confirmedAt: confirmedAtRange } : {}) },
        select: { id: true, totalAmount: true, confirmedAt: true },
      }),
      this.prisma.booking.count({
        where: { cruiseId: { in: cruiseIds }, ...(createdAtRange ? { createdAt: createdAtRange } : {}) },
      }),
      this.prisma.booking.count({
        where: {
          cruiseId: { in: cruiseIds },
          status: BookingStatus.CANCELLED,
          ...(cancelledAtRange ? { cancelledAt: cancelledAtRange } : {}),
        },
      }),
      this.prisma.cruise.findMany({ where: { id: { in: cruiseIds } }, select: { id: true, shipId: true } }),
    ]);

    const confirmedBookingIds = confirmedBookings.map((b) => b.id);
    const revenue = confirmedBookings.reduce((sum, b) => sum.add(b.totalAmount), new Prisma.Decimal(0));
    const passengersCount =
      confirmedBookingIds.length === 0
        ? 0
        : await this.prisma.bookingGuest.count({ where: { bookingId: { in: confirmedBookingIds } } });
    const averageTicket = confirmedBookings.length === 0 ? new Prisma.Decimal(0) : revenue.div(confirmedBookings.length);

    const [occupancyByCabinCategory, topEvents, topExperiences] = await Promise.all([
      this.getOccupancyByCategory(cruises),
      this.getTopEvents(cruiseIds, period),
      this.getTopExperiences(cruiseIds, period),
    ]);

    const totalCabins = occupancyByCabinCategory.reduce((sum, c) => sum + c.totalCabins, 0);
    const totalBooked = occupancyByCabinCategory.reduce((sum, c) => sum + c.booked, 0);

    return {
      revenue: revenue.toFixed(2),
      bookingsCount,
      confirmedBookingsCount: confirmedBookings.length,
      cancellations,
      passengersCount,
      averageTicket: averageTicket.toFixed(2),
      occupancyPercent: totalCabins === 0 ? 0 : Math.round((totalBooked / totalCabins) * 1000) / 10,
      salesByPeriod: this.groupSalesByDay(confirmedBookings),
      occupancyByCabinCategory,
      topEvents,
      topExperiences,
    };
  }

  private emptyDashboard() {
    return {
      revenue: '0.00',
      bookingsCount: 0,
      confirmedBookingsCount: 0,
      cancellations: 0,
      passengersCount: 0,
      averageTicket: '0.00',
      occupancyPercent: 0,
      salesByPeriod: [] as Array<{ date: string; revenue: string; bookings: number }>,
      occupancyByCabinCategory: [] as Array<{
        categoryId: string;
        categoryName: string;
        totalCabins: number;
        booked: number;
        occupancyPercent: number;
      }>,
      topEvents: [] as Array<{ eventId: string; title: string; reservations: number }>,
      topExperiences: [] as Array<{ experienceId: string; title: string; reservations: number }>,
    };
  }

  private dateRangeFilter(period: { from?: Date; to?: Date }): Prisma.DateTimeFilter | null {
    if (!period.from && !period.to) return null;
    return {
      ...(period.from ? { gte: period.from } : {}),
      ...(period.to ? { lte: period.to } : {}),
    };
  }

  /** Agrupa por dia (UTC) — quantas reservas CONFIRMED e quanta receita cada dia trouxe. */
  private groupSalesByDay(
    confirmedBookings: Array<{ totalAmount: Prisma.Decimal; confirmedAt: Date | null }>,
  ): Array<{ date: string; revenue: string; bookings: number }> {
    const byDay = new Map<string, { revenue: Prisma.Decimal; bookings: number }>();
    for (const booking of confirmedBookings) {
      if (!booking.confirmedAt) continue;
      const day = booking.confirmedAt.toISOString().slice(0, 10);
      const entry = byDay.get(day) ?? { revenue: new Prisma.Decimal(0), bookings: 0 };
      entry.revenue = entry.revenue.add(booking.totalAmount);
      entry.bookings += 1;
      byDay.set(day, entry);
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, entry]) => ({ date, revenue: entry.revenue.toFixed(2), bookings: entry.bookings }));
  }

  /**
   * Ocupacao por categoria de cabine, somada por cruzeiro — cada sailing e um
   * inventario proprio (a mesma cabine fisica pode aparecer em varios
   * cruzeiros), entao a capacidade de cada cruzeiro conta por si (ver
   * ADR-0016). Mesmo `SELECT` de contagem usado em `getOccupancy`, so que
   * agregado por categoria em vez de por um unico cruzeiro.
   */
  private async getOccupancyByCategory(cruises: Array<{ id: string; shipId: string }>) {
    if (cruises.length === 0) return [];

    const shipIds = [...new Set(cruises.map((c) => c.shipId))];
    const categories = await this.prisma.cabinCategory.findMany({
      where: { shipId: { in: shipIds } },
      include: { cabins: { select: { id: true } } },
    });
    const categoriesByShip = new Map<string, typeof categories>();
    for (const category of categories) {
      const bucket = categoriesByShip.get(category.shipId) ?? [];
      bucket.push(category);
      categoriesByShip.set(category.shipId, bucket);
    }

    const totals = new Map<string, { categoryId: string; categoryName: string; totalCabins: number; booked: number }>();

    await Promise.all(
      cruises.flatMap((cruise) => {
        const shipCategories = categoriesByShip.get(cruise.shipId) ?? [];
        return shipCategories.map(async (category) => {
          const cabinIds = category.cabins.map((cabin) => cabin.id);
          const booked =
            cabinIds.length === 0
              ? 0
              : await this.prisma.booking.count({
                  where: { cruiseId: cruise.id, cabinId: { in: cabinIds }, status: { in: ACTIVE_BOOKING_STATUSES } },
                });
          const entry = totals.get(category.id) ?? {
            categoryId: category.id,
            categoryName: category.name,
            totalCabins: 0,
            booked: 0,
          };
          entry.totalCabins += cabinIds.length;
          entry.booked += booked;
          totals.set(category.id, entry);
        });
      }),
    );

    return [...totals.values()]
      .map((entry) => ({
        ...entry,
        occupancyPercent: entry.totalCabins === 0 ? 0 : Math.round((entry.booked / entry.totalCabins) * 1000) / 10,
      }))
      .sort((a, b) => b.booked - a.booked);
  }

  private async getTopEvents(cruiseIds: string[], period: { from?: Date; to?: Date }) {
    const createdAtRange = this.dateRangeFilter(period);
    const grouped = await this.prisma.eventReservation.groupBy({
      by: ['eventId'],
      where: {
        status: 'CONFIRMED',
        event: { cruiseId: { in: cruiseIds } },
        ...(createdAtRange ? { createdAt: createdAtRange } : {}),
      },
      _sum: { partySize: true },
      orderBy: { _sum: { partySize: 'desc' } },
      take: 5,
    });
    if (grouped.length === 0) return [];

    const events = await this.prisma.event.findMany({
      where: { id: { in: grouped.map((g) => g.eventId) } },
      select: { id: true, title: true },
    });
    const titleById = new Map(events.map((e) => [e.id, e.title]));

    return grouped.map((g) => ({
      eventId: g.eventId,
      title: titleById.get(g.eventId) ?? 'Evento removido',
      reservations: g._sum.partySize ?? 0,
    }));
  }

  private async getTopExperiences(cruiseIds: string[], period: { from?: Date; to?: Date }) {
    const createdAtRange = this.dateRangeFilter(period);
    const grouped = await this.prisma.bookingExperience.groupBy({
      by: ['experienceId'],
      where: {
        booking: { cruiseId: { in: cruiseIds }, status: BookingStatus.CONFIRMED },
        ...(createdAtRange ? { createdAt: createdAtRange } : {}),
      },
      _sum: { partySize: true },
      orderBy: { _sum: { partySize: 'desc' } },
      take: 5,
    });
    if (grouped.length === 0) return [];

    const experiences = await this.prisma.experience.findMany({
      where: { id: { in: grouped.map((g) => g.experienceId) } },
      select: { id: true, title: true },
    });
    const titleById = new Map(experiences.map((e) => [e.id, e.title]));

    return grouped.map((g) => ({
      experienceId: g.experienceId,
      title: titleById.get(g.experienceId) ?? 'Experiencia removida',
      reservations: g._sum.partySize ?? 0,
    }));
  }
}
