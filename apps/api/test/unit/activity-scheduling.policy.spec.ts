import { ConflictException } from '@nestjs/common';
import { ActivitySchedulingPolicy, type TimeWindow } from '../../src/modules/activities/domain/activity-scheduling.policy';

function window(startHour: number, endHour: number, label = 'Existente'): TimeWindow {
  const base = new Date('2027-03-10T00:00:00.000Z');
  return {
    start: new Date(base.getTime() + startHour * 3_600_000),
    end: new Date(base.getTime() + endHour * 3_600_000),
    label,
  };
}

describe('ActivitySchedulingPolicy', () => {
  describe('findConflict', () => {
    it('null quando a agenda esta vazia', () => {
      expect(ActivitySchedulingPolicy.findConflict([], window(10, 12))).toBeNull();
    });

    it('null quando a nova janela nao sobrepoe nenhuma existente', () => {
      expect(ActivitySchedulingPolicy.findConflict([window(10, 12)], window(14, 16))).toBeNull();
    });

    it('detecta sobreposicao total (candidata contida na existente)', () => {
      expect(ActivitySchedulingPolicy.findConflict([window(10, 16)], window(12, 14))).not.toBeNull();
    });

    it('detecta sobreposicao parcial no inicio', () => {
      expect(ActivitySchedulingPolicy.findConflict([window(10, 12)], window(11, 13))).not.toBeNull();
    });

    it('detecta sobreposicao parcial no fim', () => {
      expect(ActivitySchedulingPolicy.findConflict([window(11, 13)], window(10, 12))).not.toBeNull();
    });

    it('janelas que so se tocam na borda NAO sao conflito (fim de uma = inicio da outra)', () => {
      expect(ActivitySchedulingPolicy.findConflict([window(10, 12)], window(12, 14))).toBeNull();
      expect(ActivitySchedulingPolicy.findConflict([window(12, 14)], window(10, 12))).toBeNull();
    });

    it('so reporta a janela que de fato colide dentre varias na agenda', () => {
      const agenda = [window(8, 9, 'Cafe da manha'), window(20, 22, 'Show')];
      const conflict = ActivitySchedulingPolicy.findConflict(agenda, window(21, 23));
      expect(conflict?.label).toBe('Show');
    });
  });

  describe('assertNoConflict', () => {
    it('nao lanca quando nao ha conflito', () => {
      expect(() => ActivitySchedulingPolicy.assertNoConflict([window(10, 12)], window(14, 16, 'Novo'))).not.toThrow();
    });

    it('lanca ConflictException citando o nome do compromisso conflitante', () => {
      expect(() =>
        ActivitySchedulingPolicy.assertNoConflict([window(10, 12, 'Jantar no Salao Azul')], window(11, 13, 'Show')),
      ).toThrow(ConflictException);
      expect(() =>
        ActivitySchedulingPolicy.assertNoConflict([window(10, 12, 'Jantar no Salao Azul')], window(11, 13, 'Show')),
      ).toThrow(/Jantar no Salao Azul/);
    });
  });
});
