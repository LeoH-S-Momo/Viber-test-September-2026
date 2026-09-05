import { Injectable } from '@nestjs/common';
import { Prisma, TicketStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';

const CHECK_IN_INCLUDE = {
  bookingGuest: {
    include: {
      booking: {
        include: {
          user: { select: { id: true, fullName: true, email: true } },
          cruise: { select: { id: true, title: true, slug: true, organizerId: true } },
          cabin: { select: { code: true, cabinCategory: { select: { name: true } } } },
        },
      },
    },
  },
} satisfies Prisma.TicketInclude;

export type TicketWithCheckInContext = Prisma.TicketGetPayload<{ include: typeof CHECK_IN_INCLUDE }>;

@Injectable()
export class TicketsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMine(userId: string) {
    return this.prisma.ticket.findMany({
      where: { bookingGuest: { booking: { userId } } },
      orderBy: { issuedAt: 'desc' },
      // Sem paginacao de verdade (GET /tickets/me devolve um array simples, nao um
      // PaginatedResult) — um teto generoso evita uma query sem limite pra quem acumular
      // muitas viagens/hospedes ao longo do tempo, sem quebrar o contrato atual do endpoint.
      take: 50,
      include: {
        bookingGuest: {
          select: {
            fullName: true,
            booking: {
              select: {
                id: true,
                cruise: { select: { title: true, slug: true, embarkationDate: true } },
                cabin: { select: { code: true, cabinCategory: { select: { name: true } } } },
              },
            },
          },
        },
        // Ultimo check-in de fato (nao so o status) — "onde/quando fiz check-in", pra
        // Minha Viagem mostrar ao passageiro, nao so ao staff (ver ADR-0015).
        checkIns: { orderBy: { checkedInAt: 'desc' }, take: 1, select: { checkedInAt: true, location: true } },
      },
    });
  }

  /** Leitura rica (sem lock) — usada pela consulta/lookup de check-in, que nunca escreve. */
  findByCodeForCheckIn(code: string): Promise<TicketWithCheckInContext | null> {
    return this.prisma.ticket.findUnique({ where: { qrCode: code }, include: CHECK_IN_INCLUDE });
  }

  findByIdForCheckIn(tx: Prisma.TransactionClient, ticketId: string): Promise<TicketWithCheckInContext | null> {
    return tx.ticket.findUnique({ where: { id: ticketId }, include: CHECK_IN_INCLUDE });
  }

  /**
   * `SELECT ... FOR UPDATE` pelo codigo — trava a linha do ticket ate o fim
   * da transacao chamadora, mesmo principio de `BookingsRepository.
   * lockBookingForUpdate` (ADR-0009/0010): a segunda tentativa concorrente
   * de check-in do MESMO ticket bloqueia aqui ate a primeira commitar, so
   * entao le o estado ja consolidado — e o que garante que um ticket nunca
   * e usado duas vezes mesmo sob concorrencia de verdade (ver ADR-0013).
   * Tambem serializa contra `TicketsService.cancelTicketsForBooking`
   * (cancelamento de reserva ja confirmada): qualquer que chegue primeiro
   * na linha do ticket vence, a outra ve o estado final ja resolvido.
   */
  async lockByCodeForUpdate(tx: Prisma.TransactionClient, code: string): Promise<{ id: string } | null> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM tickets WHERE "qrCode" = ${code} FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  createCheckIn(
    tx: Prisma.TransactionClient,
    data: { ticketId: string; staffUserId: string; location?: string },
  ) {
    return tx.checkIn.create({ data });
  }

  markCheckedIn(tx: Prisma.TransactionClient, ticketId: string) {
    return tx.ticket.update({ where: { id: ticketId }, data: { status: TicketStatus.CHECKED_IN } });
  }

  createTicketForGuest(bookingGuestId: string, qrCode: string) {
    return this.prisma.ticket.upsert({
      where: { bookingGuestId },
      update: {},
      create: { bookingGuestId, qrCode },
    });
  }

  findGuestIdsForBooking(bookingId: string) {
    return this.prisma.bookingGuest.findMany({ where: { bookingId }, select: { id: true } });
  }

  /** Usado por `issueTicketsForBooking` so pra saber se um retry ja tinha completado antes (ver ADR-0019). */
  countIssuedForBooking(bookingId: string) {
    return this.prisma.ticket.count({ where: { bookingGuest: { bookingId } } });
  }

  /**
   * Cancela (nao apaga — mantem o historico) todo ticket ainda `ISSUED` de
   * uma reserva que foi cancelada depois de confirmada e ja ter emitido
   * tickets — sem isto, um ticket de uma reserva cancelada continuaria
   * `ISSUED` e passaria no check-in (ver ADR-0013, "verificar se a reserva
   * esta confirmada").
   */
  cancelTicketsForBooking(tx: Prisma.TransactionClient, bookingId: string) {
    return tx.ticket.updateMany({
      where: { bookingGuest: { bookingId }, status: TicketStatus.ISSUED },
      data: { status: TicketStatus.CANCELLED },
    });
  }
}
