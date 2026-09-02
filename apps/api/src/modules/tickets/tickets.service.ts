import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { CheckInInput } from '@seapass/contracts';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class TicketsService {
  constructor(private readonly prisma: PrismaService) {}

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
