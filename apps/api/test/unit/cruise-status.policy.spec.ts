import { ConflictException } from '@nestjs/common';
import { CruiseStatus } from '@prisma/client';
import { CruiseStatusPolicy } from '../../src/modules/catalog/domain/cruise-status.policy';

describe('CruiseStatusPolicy', () => {
  describe('assertCanPublish', () => {
    it('allows publishing a DRAFT cruise with itinerary and pricing', () => {
      expect(() =>
        CruiseStatusPolicy.assertCanPublish(CruiseStatus.DRAFT, {
          hasItinerary: true,
          hasPricing: true,
        }),
      ).not.toThrow();
    });

    it('rejects publishing a cruise that is not DRAFT', () => {
      expect(() =>
        CruiseStatusPolicy.assertCanPublish(CruiseStatus.PUBLISHED, {
          hasItinerary: true,
          hasPricing: true,
        }),
      ).toThrow(ConflictException);
    });

    it('rejects publishing without an itinerary', () => {
      expect(() =>
        CruiseStatusPolicy.assertCanPublish(CruiseStatus.DRAFT, {
          hasItinerary: false,
          hasPricing: true,
        }),
      ).toThrow(/itinerario/);
    });

    it('rejects publishing without pricing', () => {
      expect(() =>
        CruiseStatusPolicy.assertCanPublish(CruiseStatus.DRAFT, {
          hasItinerary: true,
          hasPricing: false,
        }),
      ).toThrow(/preco/);
    });
  });

  describe('assertCanUnpublish', () => {
    it('allows unpublishing a PUBLISHED cruise', () => {
      expect(() => CruiseStatusPolicy.assertCanUnpublish(CruiseStatus.PUBLISHED)).not.toThrow();
    });

    it.each([CruiseStatus.DRAFT, CruiseStatus.CANCELLED, CruiseStatus.COMPLETED])(
      'rejects unpublishing a %s cruise',
      (status) => {
        expect(() => CruiseStatusPolicy.assertCanUnpublish(status)).toThrow(ConflictException);
      },
    );
  });
});
