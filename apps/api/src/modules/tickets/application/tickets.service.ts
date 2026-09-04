import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as QRCode from 'qrcode';
import { Prisma, TicketStatus, type BookingStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { CheckInPolicy, type CheckInCandidate, type CheckInOutcome } from '../domain/check-in.policy';
import { generateSecureTicketCode } from '../domain/secure-code';
import { TicketsRepository, type TicketWithCheckInContext } from '../persistence/tickets.repository';

export interface CheckInTicketView {
  ticketId: string;
  code: string;
  status: TicketStatus;
  passengerName: string;
  accountHolderName: string;
  cruiseTitle: string;
  cruiseSlug: string;
  cabinCode: string;
  cabinCategoryName: string;
  bookingStatus: BookingStatus;
}

export interface CheckInLookupResult {
  outcome: CheckInOutcome;
  ticket: CheckInTicketView | null;
}

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ticketsRepository: TicketsRepository,
  ) {}

  /**
   * Emite um ingresso por hospede da reserva — "gere um ticket", "associe-o
   * ao passageiro", "gere um identificador seguro" (ver
   * docs/architecture/decisions/0013-digital-ticket-checkin.md). Chamado
   * pelo `TicketIssuanceProcessor` depois que uma reserva vira CONFIRMED
   * (ADR-0012). `createTicketForGuest` e um `upsert` — idempotente: um
   * retry do job (BullMQ) ou uma segunda emissao para o mesmo hospede nunca
   * cria um ingresso duplicado nem sobrescreve o codigo ja emitido.
   */
  async issueTicketsForBooking(bookingId: string): Promise<number> {
    const guests = await this.ticketsRepository.findGuestIdsForBooking(bookingId);
    for (const guest of guests) {
      await this.ticketsRepository.createTicketForGuest(guest.id, generateSecureTicketCode());
    }
    return guests.length;
  }

  /** "Disponibilize o ticket no frontend" — inclui o QR Code (gerado sob demanda, nunca persistido) de cada ticket. */
  async findMine(userId: string) {
    const tickets = await this.ticketsRepository.findMine(userId);
    return Promise.all(
      tickets.map(async (ticket) => ({
        ...ticket,
        qrCodeDataUrl: await QRCode.toDataURL(ticket.qrCode, { margin: 1, width: 240 }),
      })),
    );
  }

  /**
   * "Localizar ticket" + "validar ticket" + "verificar se a reserva esta
   * confirmada" + "verificar se ja realizou check-in" — consulta pura, sem
   * lock nem escrita: e o que a tela de check-in usa pra MOSTRAR o
   * resultado antes do staff confirmar (ver ADR-0013). Nunca lanca 404 por
   * codigo invalido — "nao encontrado" e um `outcome` (`INVALID`), nao um
   * erro HTTP, porque e um resultado esperado da operacao de busca.
   */
  async lookupForCheckIn(organizerId: string, code: string): Promise<CheckInLookupResult> {
    const ticket = await this.ticketsRepository.findByCodeForCheckIn(code);
    if (ticket) {
      this.assertBelongsToOrganizer(ticket, organizerId);
    }
    return {
      outcome: CheckInPolicy.evaluate(ticket ? this.toCandidate(ticket) : null),
      ticket: ticket ? this.toCheckInView(ticket) : null,
    };
  }

  /**
   * "Realizar check-in" — a mutacao. Revalida tudo de novo (nunca confia no
   * resultado de um `lookupForCheckIn` anterior: tempo passou entre as duas
   * chamadas) dentro de uma transacao com o ticket travado (`SELECT ... FOR
   * UPDATE`) — a mesma garantia de concorrencia de ADR-0009/0010/0012,
   * aplicada aqui para "nao permitir que um ticket seja usado duas vezes"
   * mesmo sob N tentativas simultaneas (ver check-in.e2e-spec.ts).
   */
  async confirmCheckIn(
    organizerId: string,
    staffUserId: string,
    code: string,
    location?: string,
  ): Promise<CheckInTicketView> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await this.ticketsRepository.lockByCodeForUpdate(tx, code);
      if (!locked) {
        throw new NotFoundException('Ticket nao encontrado.');
      }
      const ticket = await this.ticketsRepository.findByIdForCheckIn(tx, locked.id);
      if (!ticket) {
        throw new NotFoundException('Ticket nao encontrado.');
      }
      this.assertBelongsToOrganizer(ticket, organizerId);
      CheckInPolicy.assertCanCheckIn(this.toCandidate(ticket));

      await this.ticketsRepository.createCheckIn(tx, { ticketId: ticket.id, staffUserId, location });
      await this.ticketsRepository.markCheckedIn(tx, ticket.id);

      const updated = await this.ticketsRepository.findByIdForCheckIn(tx, ticket.id);
      return this.toCheckInView(updated!);
    });
  }

  /**
   * "Verificar se a reserva esta confirmada" tambem se aplica ao contrario:
   * uma reserva CONFIRMED que e cancelada depois (ver
   * BookingsService.cancelBooking) precisa invalidar os tickets ja
   * emitidos — senao eles continuariam ISSUED e passariam no check-in.
   */
  cancelTicketsForBooking(tx: Prisma.TransactionClient, bookingId: string) {
    return this.ticketsRepository.cancelTicketsForBooking(tx, bookingId);
  }

  private assertBelongsToOrganizer(ticket: TicketWithCheckInContext, organizerId: string): void {
    if (ticket.bookingGuest.booking.cruise.organizerId !== organizerId) {
      throw new ForbiddenException('Este ticket nao pertence a um cruzeiro do seu organizador.');
    }
  }

  private toCandidate(ticket: TicketWithCheckInContext): CheckInCandidate {
    return { ticketStatus: ticket.status, bookingStatus: ticket.bookingGuest.booking.status };
  }

  private toCheckInView(ticket: TicketWithCheckInContext): CheckInTicketView {
    const booking = ticket.bookingGuest.booking;
    return {
      ticketId: ticket.id,
      code: ticket.qrCode,
      status: ticket.status,
      passengerName: ticket.bookingGuest.fullName,
      accountHolderName: booking.user.fullName,
      cruiseTitle: booking.cruise.title,
      cruiseSlug: booking.cruise.slug,
      cabinCode: booking.cabin.code,
      cabinCategoryName: booking.cabin.cabinCategory.name,
      bookingStatus: booking.status,
    };
  }
}
