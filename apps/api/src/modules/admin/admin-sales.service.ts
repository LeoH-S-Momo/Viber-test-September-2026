import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BookingStatus, Prisma } from '@prisma/client';
import type { AdminBookingsQuery, AdminCheckInsQuery, AdminPaymentsQuery, AdminTicketsQuery } from '@seapass/contracts';
import { PrismaService } from '../../database/prisma/prisma.service';
import { toPageResult, toSkipTake } from '../catalog/domain/pagination';
import { AuditLogService } from '../../audit/audit-log.service';
import { DomainEvent } from '../../domain-events/domain-events';
import { ActivitiesService } from '../activities/application/activities.service';
import { TicketsService } from '../tickets/application/tickets.service';

/** Estados de reserva que ainda podem ser cancelados por um admin — os terminais (ja resolvidos) nao. */
const CANCELLABLE_BOOKING_STATUSES: BookingStatus[] = [BookingStatus.HELD, BookingStatus.PAYMENT_PENDING, BookingStatus.CONFIRMED];

/** Leitura global (sem escopo de organizador) do ciclo de vendas — reservas, pagamentos, tickets, check-ins (ver ADR-0018). */
@Injectable()
export class AdminSalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly ticketsService: TicketsService,
    private readonly activitiesService: ActivitiesService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // --- Reservas ---

  async listBookings(query: AdminBookingsQuery) {
    const where: Prisma.BookingWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.cruiseId ? { cruiseId: query.cruiseId } : {}),
      ...(query.q
        ? {
            OR: [
              { user: { email: { contains: query.q, mode: 'insensitive' } } },
              { user: { fullName: { contains: query.q, mode: 'insensitive' } } },
              { guests: { some: { fullName: { contains: query.q, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
    const { skip, take } = toSkipTake(query.page, query.pageSize);
    const [data, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          cruise: { select: { id: true, title: true } },
          cabin: { select: { code: true, cabinCategory: { select: { name: true } } } },
          user: { select: { id: true, fullName: true, email: true } },
          guests: { select: { id: true, fullName: true, isPrimary: true } },
        },
      }),
      this.prisma.booking.count({ where }),
    ]);
    return toPageResult(data, total, query.page, query.pageSize);
  }

  async getBooking(id: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        cruise: { select: { id: true, title: true, organizer: { select: { id: true, name: true } } } },
        cabin: { select: { code: true, cabinCategory: { select: { name: true } } } },
        user: { select: { id: true, fullName: true, email: true } },
        guests: true,
        payments: { orderBy: { createdAt: 'desc' } },
        experiences: { include: { experience: { select: { title: true } } } },
        eventReservations: { include: { event: { select: { title: true } } } },
        diningReservations: { include: { diningSlot: { select: { label: true } } } },
        coupon: { select: { code: true } },
      },
    });
    if (!booking) {
      throw new NotFoundException('Reserva nao encontrada.');
    }
    return booking;
  }

  /** Cancelamento administrativo — ignora quem e o dono, so exige um status ainda nao-terminal (ver ADR-0018). */
  async cancelBooking(actorUserId: string, id: string, reason?: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) {
      throw new NotFoundException('Reserva nao encontrada.');
    }
    if (!CANCELLABLE_BOOKING_STATUSES.includes(booking.status)) {
      throw new BadRequestException(`Reserva em status ${booking.status} nao pode mais ser cancelada.`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.booking.update({
        where: { id },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledAt: new Date(),
          cancellationReason: reason ?? 'Cancelada por um administrador da plataforma.',
        },
      });
      await this.ticketsService.cancelTicketsForBooking(tx, id);
      // Mesma cascata do cancelamento pelo passageiro (ver BookingsService.cancelBooking) —
      // sem isto, reservas de evento/restaurante ficavam CONFIRMED presas pra sempre mesmo com
      // a reserva cancelada por um admin (bug encontrado e corrigido na revisao geral de 2026-09-05).
      await this.activitiesService.cancelReservationsForBookings(tx, [id]);
      return result;
    });

    await this.auditLog.record({
      actorUserId,
      action: 'booking.admin_cancelled',
      entityType: 'Booking',
      entityId: id,
      metadata: { previousStatus: booking.status, reason },
    });
    this.eventEmitter.emit(DomainEvent.BOOKING_CANCELLED, { bookingId: id, reason: reason ?? null, cancelledBy: 'ADMIN' });
    return updated;
  }

  // --- Pagamentos ---

  async listPayments(query: AdminPaymentsQuery) {
    const where: Prisma.PaymentWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.method ? { method: query.method } : {}),
    };
    const { skip, take } = toSkipTake(query.page, query.pageSize);
    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          booking: {
            select: { id: true, status: true, user: { select: { fullName: true, email: true } }, cruise: { select: { title: true } } },
          },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);
    return toPageResult(data, total, query.page, query.pageSize);
  }

  async getPayment(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        booking: {
          select: {
            id: true,
            status: true,
            totalAmount: true,
            user: { select: { fullName: true, email: true } },
            cruise: { select: { title: true } },
          },
        },
      },
    });
    if (!payment) {
      throw new NotFoundException('Pagamento nao encontrado.');
    }
    return payment;
  }

  // --- Tickets ---

  async listTickets(query: AdminTicketsQuery) {
    const where: Prisma.TicketWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { qrCode: { contains: query.q, mode: 'insensitive' } },
              { bookingGuest: { fullName: { contains: query.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const { skip, take } = toSkipTake(query.page, query.pageSize);
    const [data, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        orderBy: { issuedAt: 'desc' },
        skip,
        take,
        include: {
          bookingGuest: {
            select: { fullName: true, booking: { select: { id: true, cruise: { select: { title: true } } } } },
          },
        },
      }),
      this.prisma.ticket.count({ where }),
    ]);
    return toPageResult(data, total, query.page, query.pageSize);
  }

  async getTicket(id: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: {
        bookingGuest: {
          select: {
            fullName: true,
            booking: { select: { id: true, status: true, cruise: { select: { title: true } }, cabin: { select: { code: true } } } },
          },
        },
        checkIns: { orderBy: { checkedInAt: 'desc' }, include: { staffUser: { select: { fullName: true, email: true } } } },
      },
    });
    if (!ticket) {
      throw new NotFoundException('Ticket nao encontrado.');
    }
    return ticket;
  }

  // --- Check-ins ---

  async listCheckIns(query: AdminCheckInsQuery) {
    const where: Prisma.CheckInWhereInput = {
      ...(query.staffUserId ? { staffUserId: query.staffUserId } : {}),
      ...(query.from || query.to
        ? { checkedInAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } }
        : {}),
      ...(query.q ? { ticket: { qrCode: { contains: query.q, mode: 'insensitive' } } } : {}),
    };
    const { skip, take } = toSkipTake(query.page, query.pageSize);
    const [data, total] = await Promise.all([
      this.prisma.checkIn.findMany({
        where,
        orderBy: { checkedInAt: 'desc' },
        skip,
        take,
        include: {
          ticket: { select: { qrCode: true, bookingGuest: { select: { fullName: true } } } },
          staffUser: { select: { fullName: true, email: true } },
        },
      }),
      this.prisma.checkIn.count({ where }),
    ]);
    return toPageResult(data, total, query.page, query.pageSize);
  }
}
