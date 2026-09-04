import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { BookingStatus, TicketStatus } from '@prisma/client';
import { TicketsService } from '../../src/modules/tickets/application/tickets.service';
import type { TicketWithCheckInContext } from '../../src/modules/tickets/persistence/tickets.repository';

function buildTicket(overrides: {
  id?: string;
  qrCode?: string;
  status?: TicketStatus;
  organizerId?: string;
  bookingStatus?: BookingStatus;
} = {}): TicketWithCheckInContext {
  return {
    id: overrides.id ?? 'ticket-1',
    bookingGuestId: 'guest-1',
    qrCode: overrides.qrCode ?? 'TICKET-abc',
    status: overrides.status ?? TicketStatus.ISSUED,
    issuedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    bookingGuest: {
      id: 'guest-1',
      bookingId: 'booking-1',
      fullName: 'Hospede Teste',
      documentType: 'PASSPORT',
      documentNumber: '123',
      birthDate: null,
      isPrimary: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      booking: {
        id: 'booking-1',
        status: overrides.bookingStatus ?? BookingStatus.CONFIRMED,
        user: { id: 'user-1', fullName: 'Titular Teste', email: 'titular@example.com' },
        cruise: { id: 'cruise-1', title: 'Cruzeiro Teste', slug: 'cruzeiro-teste', organizerId: overrides.organizerId ?? 'org-1' },
        cabin: { code: '101', cabinCategory: { name: 'Interna' } },
      },
    },
  } as unknown as TicketWithCheckInContext;
}

function buildService() {
  const ticketsRepository = {
    findMine: jest.fn(),
    findByCodeForCheckIn: jest.fn(),
    findByIdForCheckIn: jest.fn(),
    lockByCodeForUpdate: jest.fn(),
    createCheckIn: jest.fn(),
    markCheckedIn: jest.fn(),
    createTicketForGuest: jest.fn(),
    findGuestIdsForBooking: jest.fn(),
    cancelTicketsForBooking: jest.fn(),
  };
  const tx = {};
  const prisma = { $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(tx)) };
  const auditLog = { record: jest.fn() };

  const service = new TicketsService(prisma as never, ticketsRepository as never, auditLog as never);
  return { service, ticketsRepository, prisma, tx, auditLog };
}

describe('TicketsService', () => {
  describe('issueTicketsForBooking', () => {
    it('cria um ticket por hospede com um codigo seguro gerado (nao reaproveitado entre hospedes)', async () => {
      const { service, ticketsRepository } = buildService();
      ticketsRepository.findGuestIdsForBooking.mockResolvedValue([{ id: 'guest-1' }, { id: 'guest-2' }]);

      const count = await service.issueTicketsForBooking('booking-1');

      expect(count).toBe(2);
      expect(ticketsRepository.createTicketForGuest).toHaveBeenCalledTimes(2);
      const [firstCall, secondCall] = ticketsRepository.createTicketForGuest.mock.calls;
      expect(firstCall[0]).toBe('guest-1');
      expect(secondCall[0]).toBe('guest-2');
      expect(firstCall[1]).not.toBe(secondCall[1]); // codigos distintos por hospede
      expect(firstCall[1]).toMatch(/^TICKET-/);
    });
  });

  describe('findMine', () => {
    it('inclui um QR Code (data URI) gerado a partir do codigo de cada ticket', async () => {
      const { service, ticketsRepository } = buildService();
      ticketsRepository.findMine.mockResolvedValue([{ id: 't1', qrCode: 'TICKET-abc' }]);

      const tickets = await service.findMine('user-1');

      expect(tickets[0]?.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    });
  });

  describe('lookupForCheckIn', () => {
    it('devolve outcome NOT_CHECKED_IN e os dados do ticket para um codigo valido', async () => {
      const { service, ticketsRepository } = buildService();
      ticketsRepository.findByCodeForCheckIn.mockResolvedValue(buildTicket());

      const result = await service.lookupForCheckIn('org-1', 'TICKET-abc');

      expect(result.outcome).toBe('NOT_CHECKED_IN');
      expect(result.ticket).toMatchObject({
        code: 'TICKET-abc',
        passengerName: 'Hospede Teste',
        cruiseTitle: 'Cruzeiro Teste',
        cabinCode: '101',
      });
    });

    it('devolve outcome INVALID e ticket null quando o codigo nao corresponde a nada (nunca lanca 404 aqui — e uma consulta)', async () => {
      const { service, ticketsRepository } = buildService();
      ticketsRepository.findByCodeForCheckIn.mockResolvedValue(null);

      const result = await service.lookupForCheckIn('org-1', 'NAO-EXISTE');

      expect(result.outcome).toBe('INVALID');
      expect(result.ticket).toBeNull();
    });

    it('devolve outcome ALREADY_USED para um ticket ja utilizado', async () => {
      const { service, ticketsRepository } = buildService();
      ticketsRepository.findByCodeForCheckIn.mockResolvedValue(buildTicket({ status: TicketStatus.CHECKED_IN }));

      const result = await service.lookupForCheckIn('org-1', 'TICKET-abc');

      expect(result.outcome).toBe('ALREADY_USED');
    });

    it('rejeita (403) um ticket de um cruzeiro de OUTRO organizador, sem revelar o resultado da validacao', async () => {
      const { service, ticketsRepository } = buildService();
      ticketsRepository.findByCodeForCheckIn.mockResolvedValue(buildTicket({ organizerId: 'org-2' }));

      await expect(service.lookupForCheckIn('org-1', 'TICKET-abc')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('confirmCheckIn', () => {
    it('realiza o check-in: trava por codigo, cria o CheckIn e marca o ticket como CHECKED_IN', async () => {
      const { service, ticketsRepository } = buildService();
      ticketsRepository.lockByCodeForUpdate.mockResolvedValue({ id: 'ticket-1' });
      ticketsRepository.findByIdForCheckIn
        .mockResolvedValueOnce(buildTicket())
        .mockResolvedValueOnce(buildTicket({ status: TicketStatus.CHECKED_IN }));

      const result = await service.confirmCheckIn('org-1', 'staff-1', 'TICKET-abc', 'Portao A');

      expect(ticketsRepository.lockByCodeForUpdate).toHaveBeenCalledWith(expect.anything(), 'TICKET-abc');
      expect(ticketsRepository.createCheckIn).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ ticketId: 'ticket-1', staffUserId: 'staff-1', location: 'Portao A' }),
      );
      expect(ticketsRepository.markCheckedIn).toHaveBeenCalledWith(expect.anything(), 'ticket-1');
      expect(result.status).toBe(TicketStatus.CHECKED_IN);
    });

    it('rejeita (404) um codigo que nao corresponde a nenhum ticket', async () => {
      const { service, ticketsRepository } = buildService();
      ticketsRepository.lockByCodeForUpdate.mockResolvedValue(null);

      await expect(service.confirmCheckIn('org-1', 'staff-1', 'NAO-EXISTE')).rejects.toBeInstanceOf(NotFoundException);
      expect(ticketsRepository.createCheckIn).not.toHaveBeenCalled();
    });

    it('rejeita (409) um ticket ja utilizado, sem criar um segundo CheckIn', async () => {
      const { service, ticketsRepository } = buildService();
      ticketsRepository.lockByCodeForUpdate.mockResolvedValue({ id: 'ticket-1' });
      ticketsRepository.findByIdForCheckIn.mockResolvedValue(buildTicket({ status: TicketStatus.CHECKED_IN }));

      await expect(service.confirmCheckIn('org-1', 'staff-1', 'TICKET-abc')).rejects.toBeInstanceOf(ConflictException);
      expect(ticketsRepository.createCheckIn).not.toHaveBeenCalled();
      expect(ticketsRepository.markCheckedIn).not.toHaveBeenCalled();
    });

    it('rejeita (409) uma reserva que nao esta confirmada', async () => {
      const { service, ticketsRepository } = buildService();
      ticketsRepository.lockByCodeForUpdate.mockResolvedValue({ id: 'ticket-1' });
      ticketsRepository.findByIdForCheckIn.mockResolvedValue(buildTicket({ bookingStatus: BookingStatus.CANCELLED }));

      await expect(service.confirmCheckIn('org-1', 'staff-1', 'TICKET-abc')).rejects.toBeInstanceOf(ConflictException);
      expect(ticketsRepository.createCheckIn).not.toHaveBeenCalled();
    });

    it('rejeita (403) um ticket de um cruzeiro de outro organizador antes de checar elegibilidade', async () => {
      const { service, ticketsRepository } = buildService();
      ticketsRepository.lockByCodeForUpdate.mockResolvedValue({ id: 'ticket-1' });
      ticketsRepository.findByIdForCheckIn.mockResolvedValue(buildTicket({ organizerId: 'org-2' }));

      await expect(service.confirmCheckIn('org-1', 'staff-1', 'TICKET-abc')).rejects.toBeInstanceOf(ForbiddenException);
      expect(ticketsRepository.createCheckIn).not.toHaveBeenCalled();
    });
  });

  describe('cancelTicketsForBooking', () => {
    it('delega ao repositorio dentro da transacao recebida', async () => {
      const { service, ticketsRepository, tx } = buildService();

      await service.cancelTicketsForBooking(tx as never, 'booking-1');

      expect(ticketsRepository.cancelTicketsForBooking).toHaveBeenCalledWith(tx, 'booking-1');
    });
  });
});
