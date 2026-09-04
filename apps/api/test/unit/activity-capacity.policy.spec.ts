import { ConflictException } from '@nestjs/common';
import { ActivityCapacityPolicy } from '../../src/modules/activities/domain/activity-capacity.policy';

describe('ActivityCapacityPolicy', () => {
  describe('assertHasCapacity', () => {
    it('nao lanca quando ha vagas suficientes', () => {
      expect(() =>
        ActivityCapacityPolicy.assertHasCapacity({ capacity: 10, alreadyReserved: 4, partySize: 6 }),
      ).not.toThrow();
    });

    it('nao lanca quando o pedido preenche exatamente a capacidade restante', () => {
      expect(() =>
        ActivityCapacityPolicy.assertHasCapacity({ capacity: 10, alreadyReserved: 8, partySize: 2 }),
      ).not.toThrow();
    });

    it('lanca ConflictException quando o pedido ultrapassa a capacidade', () => {
      expect(() =>
        ActivityCapacityPolicy.assertHasCapacity({ capacity: 10, alreadyReserved: 8, partySize: 3 }),
      ).toThrow(ConflictException);
    });

    it('a mensagem de erro informa quantas vagas realmente restam', () => {
      expect(() =>
        ActivityCapacityPolicy.assertHasCapacity({ capacity: 10, alreadyReserved: 8, partySize: 5 }),
      ).toThrow(/restam 2 vaga/);
    });

    it('nunca reporta vagas negativas na mensagem mesmo se ja sobrelotado (rede de seguranca)', () => {
      expect(() =>
        ActivityCapacityPolicy.assertHasCapacity({ capacity: 10, alreadyReserved: 12, partySize: 1 }),
      ).toThrow(/restam 0 vaga/);
    });

    it('capacity null significa sem limite — nunca lanca, qualquer partySize', () => {
      expect(() =>
        ActivityCapacityPolicy.assertHasCapacity({ capacity: null, alreadyReserved: 1_000_000, partySize: 500 }),
      ).not.toThrow();
    });

    it('capacity zero rejeita qualquer partySize positivo', () => {
      expect(() =>
        ActivityCapacityPolicy.assertHasCapacity({ capacity: 0, alreadyReserved: 0, partySize: 1 }),
      ).toThrow(ConflictException);
    });
  });
});
