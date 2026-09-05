import { ConflictException } from '@nestjs/common';
import { EventsService } from '../../src/modules/catalog/application/events.service';

function buildService() {
  const eventsRepository = { findById: jest.fn(), update: jest.fn() };
  const cruisesService = { findByIdForOrganizer: jest.fn().mockResolvedValue({ id: 'cruise-1', organizerId: 'org-1' }) };
  const venuesService = { findById: jest.fn() };
  const auditLog = { record: jest.fn() };
  const eventEmitter = { emit: jest.fn() };

  const service = new EventsService(
    eventsRepository as never,
    cruisesService as never,
    venuesService as never,
    auditLog as never,
    eventEmitter as never,
  );

  return { service, eventsRepository, cruisesService, auditLog, eventEmitter };
}

describe('EventsService', () => {
  describe('update', () => {
    const existing = {
      id: 'event-1',
      cruise: { id: 'cruise-1' },
      venueId: 'venue-1',
      startAt: new Date('2027-10-02T20:00:00Z'),
      endAt: new Date('2027-10-02T22:00:00Z'),
    };

    it('rejects a PATCH with only startAt when it would land after the existing endAt (bug found and fixed in the 2026-09-05 general review)', async () => {
      const { service, eventsRepository } = buildService();
      eventsRepository.findById.mockResolvedValue(existing);

      await expect(
        service.update('org-1', 'event-1', { startAt: new Date('2027-10-02T23:00:00Z') }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(eventsRepository.update).not.toHaveBeenCalled();
    });

    it('rejects a PATCH with only endAt when it would land before the existing startAt', async () => {
      const { service, eventsRepository } = buildService();
      eventsRepository.findById.mockResolvedValue(existing);

      await expect(
        service.update('org-1', 'event-1', { endAt: new Date('2027-10-02T19:00:00Z') }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(eventsRepository.update).not.toHaveBeenCalled();
    });

    it('allows a single-field PATCH that keeps the merged pair valid, and only emits EVENT_UPDATED when a passenger-facing field changes', async () => {
      const { service, eventsRepository, eventEmitter } = buildService();
      eventsRepository.findById.mockResolvedValue(existing);
      eventsRepository.update.mockResolvedValue({ ...existing, description: 'Nova descricao' });

      await service.update('org-1', 'event-1', { description: 'Nova descricao' });

      expect(eventsRepository.update).toHaveBeenCalledWith('event-1', { description: 'Nova descricao' });
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });
});
