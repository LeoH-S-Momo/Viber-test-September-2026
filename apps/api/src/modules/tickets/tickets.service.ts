import { randomUUID } from 'node:crypto';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { CheckInInput } from '@seapass/contracts';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class TicketsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Emite um ingresso por hospede da reserva (ver schema: "um por hospede,
   * como um cartao de embarque nominal de verdade") — chamado pelo
   * `TicketIssuanceProcessor` depois que uma reserva vira CONFIRMED (ver
   * ADR-0012). `upsert` com `update: {}` torna a operacao idempotente: um
   * retry do job (BullMQ) ou uma segunda emissao para o mesmo hospede nunca
   * cria um ingresso duplicado nem sobrescreve o QR code ja emitido.
   */
  async issueTicketsForBooking(bookingId: string): Promise<number> {
    const guests = await this.prisma.bookingGuest.findMany({
      where: { bookingId },
      select: { id: true },
    });

    for (const guest of guests) {
      await this.prisma.ticket.upsert({
        where: { bookingGuestId: guest.id },
        update: {},
        create: { bookingGuestId: guest.id, qrCode: `TICKET-${randomUUID()}` },
      });
    }

    return guests.length;
  }

  findMine(userId: string) {
    return this.prisma.ticket.findMany({
      where: { bookingGuest: { booking: { userId } } },
      orderBy: { issuedAt: 'desc' },
      include: {
        bookingGuest: {
          select: {
            fullName: true,
            booking: {
              select: { cruise: { select: { title: true, slug: true, embarkationDate: true } } },
            },
          },
        },
      },
    });
  }

  async checkIn(organizerId: string, staffUserId: string, ticketId: string, input: CheckInInput) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        bookingGuest: { include: { booking: { include: { cruise: true } } } },
      },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket nao encontrado.');
    }
    if (ticket.bookingGuest.booking.cruise.organizerId !== organizerId) {
      throw new ForbiddenException('Este ticket nao pertence a um cruzeiro do seu organizador.');
    }

    const [checkIn] = await this.prisma.$transaction([
      this.prisma.checkIn.create({
        data: { ticketId, staffUserId, location: input.location },
      }),
      this.prisma.ticket.update({ where: { id: ticketId }, data: { status: 'CHECKED_IN' } }),
    ]);

    return checkIn;
  }
}
