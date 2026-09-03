import { ConflictException, NotFoundException } from '@nestjs/common';
import { CruiseStatus } from '@prisma/client';
import { CruisesService } from '../../src/modules/catalog/application/cruises.service';

function buildService() {
  const cruisesRepository = {
    findMany: jest.fn(),
    findBySlug: jest.fn(),
    findById: jest.fn(),
    findPublishReadiness: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
    existsBySlug: jest.fn().mockResolvedValue(false),
    setCabinPricing: jest.fn(),
  };
  const shipsService = { findOwnedByOrganizerOrThrow: jest.fn() };
  const cabinCategoriesService = { findById: jest.fn() };

  const service = new CruisesService(
    cruisesRepository as never,
    shipsService as never,
    cabinCategoriesService as never,
  );

  return { service, cruisesRepository, shipsService, cabinCategoriesService };
}

describe('CruisesService', () => {
  describe('findByIdForOrganizer', () => {
    it('throws NotFoundException (not Forbidden) when the cruise belongs to another organizer', async () => {
      const { service, cruisesRepository } = buildService();
      cruisesRepository.findById.mockResolvedValue({ id: 'c1', organizerId: 'org-other' });

      await expect(service.findByIdForOrganizer('org-mine', 'c1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns the cruise when it belongs to the caller organizer', async () => {
      const { service, cruisesRepository } = buildService();
      const cruise = { id: 'c1', organizerId: 'org-mine', status: CruiseStatus.DRAFT };
      cruisesRepository.findById.mockResolvedValue(cruise);

      await expect(service.findByIdForOrganizer('org-mine', 'c1')).resolves.toBe(cruise);
    });
  });

  describe('publish', () => {
    it('rejects publishing when there is no itinerary or pricing yet', async () => {
      const { service, cruisesRepository } = buildService();
      cruisesRepository.findById.mockResolvedValue({
        id: 'c1',
        organizerId: 'org-mine',
        status: CruiseStatus.DRAFT,
      });
      cruisesRepository.findPublishReadiness.mockResolvedValue({
        _count: { itineraryStops: 0, cabinPricings: 0 },
      });

      await expect(service.publish('org-mine', 'c1')).rejects.toBeInstanceOf(ConflictException);
      expect(cruisesRepository.updateStatus).not.toHaveBeenCalled();
    });

    it('publishes when the cruise is DRAFT with itinerary and pricing', async () => {
      const { service, cruisesRepository } = buildService();
      cruisesRepository.findById.mockResolvedValue({
        id: 'c1',
        organizerId: 'org-mine',
        status: CruiseStatus.DRAFT,
      });
      cruisesRepository.findPublishReadiness.mockResolvedValue({
        _count: { itineraryStops: 2, cabinPricings: 1 },
      });
      cruisesRepository.updateStatus.mockResolvedValue({ id: 'c1', status: 'PUBLISHED' });

      await service.publish('org-mine', 'c1');

      expect(cruisesRepository.updateStatus).toHaveBeenCalledWith('c1', CruiseStatus.PUBLISHED);
    });

    it('never reaches the repository when the caller does not own the cruise', async () => {
      const { service, cruisesRepository } = buildService();
      cruisesRepository.findById.mockResolvedValue({ id: 'c1', organizerId: 'org-other' });

      await expect(service.publish('org-mine', 'c1')).rejects.toBeInstanceOf(NotFoundException);
      expect(cruisesRepository.findPublishReadiness).not.toHaveBeenCalled();
      expect(cruisesRepository.updateStatus).not.toHaveBeenCalled();
    });
  });

  describe('unpublish', () => {
    it('rejects unpublishing a cruise that is not PUBLISHED', async () => {
      const { service, cruisesRepository } = buildService();
      cruisesRepository.findById.mockResolvedValue({
        id: 'c1',
        organizerId: 'org-mine',
        status: CruiseStatus.DRAFT,
      });

      await expect(service.unpublish('org-mine', 'c1')).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('create', () => {
    it('checks ship ownership before creating the cruise', async () => {
      const { service, cruisesRepository, shipsService } = buildService();
      shipsService.findOwnedByOrganizerOrThrow.mockResolvedValue({ id: 'ship1' });
      cruisesRepository.create.mockResolvedValue({ id: 'c1' });

      await service.create('org-mine', {
        shipId: 'ship1',
        title: 'Teste',
        theme: 'Rock',
        embarkationDate: new Date('2027-01-01'),
        disembarkationDate: new Date('2027-01-05'),
        embarkationPortId: 'port1',
        disembarkationPortId: 'port1',
      });

      expect(shipsService.findOwnedByOrganizerOrThrow).toHaveBeenCalledWith('org-mine', 'ship1');
      expect(cruisesRepository.create).toHaveBeenCalled();
    });
  });
});
