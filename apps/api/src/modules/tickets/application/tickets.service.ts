import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as QRCode from 'qrcode';
import { Prisma, TicketStatus, type BookingStatus } from '@prisma/client';
import { AuditLogService } from '../../../audit/audit-log.service';
import { DomainEvent } from '../../../domain-events/domain-events';
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
    private readonly auditLog: AuditLogService,
    private readonly eventEmitter: EventEmitter2,
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
    // Contado ANTES do upsert — distingue "primeira vez que todos os tickets desta reserva
    // saem emitidos" de "retry do BullMQ depois de um sucesso anterior" (o upsert em si e
    // idempotente pro BANCO, mas sem esta checagem o EVENTO de dominio dispararia nos dois
    // casos, reenviando "seu ingresso esta pronto" numa retentativa que na verdade nao criou
    // nada novo — ver ADR-0019 sobre idempotencia).
    const alreadyIssued = await this.ticketsRepository.countIssuedForBooking(bookingId);

    for (const guest of guests) {
      await this.ticketsRepository.createTicketForGuest(guest.id, generateSecureTicketCode());
    }

    if (guests.length > 0 && alreadyIssued < guests.length) {
      this.eventEmitter.emit(DomainEvent.TICKET_GENERATED, { bookingId, ticketCount: guests.length });
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
    const found = await this.ticketsRepository.findByCodeForCheckIn(code);
    // Um ticket de OUTRO organizador conta como "nao encontrado" aqui, nao como erro — mesmo
    // principio do comentario acima (nunca lanca por codigo invalido) e de ADR-0005 (nao
    // confirmar a existencia de um recurso a quem nao e dono): um ticket de verdade, so que de
    // outro organizador, tem que parecer identico a um codigo que nunca existiu, senao o outcome
    // por si so revelaria "existe, so que nao e seu" (bug encontrado e corrigido na revisao de
    // 2026-09-05 — antes lancava ForbiddenException aqui, contradizendo o proprio comentario
    // desta funcao).
    const ticket = found && found.bookingGuest.booking.cruise.organizerId === organizerId ? found : null;
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
    const view = await this.prisma.$transaction(async (tx) => {
      const locked = await this.ticketsRepository.lockByCodeForUpdate(tx, code);
      if (!locked) {
        throw new NotFoundException('Ticket nao encontrado.');
      }
      const ticket = await this.ticketsRepository.findByIdForCheckIn(tx, locked.id);
      // Mesma mensagem/status de "nao encontrado" pra um ticket de outro organizador — ver
      // ADR-0005 (404, nao 403, pra nao confirmar a outro organizador que o ticket existe).
      if (!ticket || ticket.bookingGuest.booking.cruise.organizerId !== organizerId) {
        throw new NotFoundException('Ticket nao encontrado.');
      }
      CheckInPolicy.assertCanCheckIn(this.toCandidate(ticket));

      await this.ticketsRepository.createCheckIn(tx, { ticketId: ticket.id, staffUserId, location });
      await this.ticketsRepository.markCheckedIn(tx, ticket.id);

      const updated = await this.ticketsRepository.findByIdForCheckIn(tx, ticket.id);
      return this.toCheckInView(updated!);
    });

    await this.auditLog.record({
      actorUserId: staffUserId,
      action: 'ticket.checked_in',
      entityType: 'Ticket',
      entityId: view.ticketId,
      metadata: { code: view.code, cruiseSlug: view.cruiseSlug, location: location ?? null },
    });
    this.eventEmitter.emit(DomainEvent.CHECKIN_COMPLETED, { ticketId: view.ticketId, staffUserId });

    return view;
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
