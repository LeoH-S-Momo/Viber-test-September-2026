import { ConflictException } from '@nestjs/common';
import {
  assertDateWithinCruise,
  combineDateAndTime,
  diningSlotWindowOn,
} from '../../src/modules/activities/domain/dining-schedule.util';

describe('dining-schedule.util', () => {
  describe('combineDateAndTime', () => {
    it('combina a data de uma reserva com a hora recorrente de um DiningSlot', () => {
      const date = new Date('2027-03-15T00:00:00.000Z');
      const time = new Date('1970-01-01T19:30:00.000Z');
      const combined = combineDateAndTime(date, time);
      expect(combined.getUTCFullYear()).toBe(2027);
      expect(combined.getUTCMonth()).toBe(2);
      expect(combined.getUTCDate()).toBe(15);
      expect(combined.getUTCHours()).toBe(19);
      expect(combined.getUTCMinutes()).toBe(30);
    });
  });

  describe('diningSlotWindowOn', () => {
    it('produz uma janela absoluta start < end para um horario normal', () => {
      const date = new Date('2027-03-15T00:00:00.000Z');
      const startTime = new Date('1970-01-01T19:00:00.000Z');
      const endTime = new Date('1970-01-01T21:00:00.000Z');
      const { start, end } = diningSlotWindowOn(date, startTime, endTime);
      expect(start.getUTCHours()).toBe(19);
      expect(end.getUTCHours()).toBe(21);
      expect(end.getTime()).toBeGreaterThan(start.getTime());
    });

    it('trata um horario que atravessa a meia-noite como terminando no dia seguinte', () => {
      const date = new Date('2027-03-15T00:00:00.000Z');
      const startTime = new Date('1970-01-01T23:00:00.000Z');
      const endTime = new Date('1970-01-01T01:00:00.000Z');
      const { start, end } = diningSlotWindowOn(date, startTime, endTime);
      expect(end.getTime()).toBeGreaterThan(start.getTime());
      expect(end.getUTCDate()).toBe(16);
      expect(end.getUTCHours()).toBe(1);
    });
  });

  describe('assertDateWithinCruise', () => {
    const embarkationDate = new Date('2027-03-10T00:00:00.000Z');
    const disembarkationDate = new Date('2027-03-17T00:00:00.000Z');

    it('nao lanca para uma data dentro do periodo (inclusive as bordas)', () => {
      expect(() => assertDateWithinCruise(new Date('2027-03-13T00:00:00.000Z'), embarkationDate, disembarkationDate)).not.toThrow();
      expect(() => assertDateWithinCruise(embarkationDate, embarkationDate, disembarkationDate)).not.toThrow();
      expect(() => assertDateWithinCruise(disembarkationDate, embarkationDate, disembarkationDate)).not.toThrow();
    });

    it('lanca ConflictException para uma data antes do embarque', () => {
      expect(() =>
        assertDateWithinCruise(new Date('2027-03-09T00:00:00.000Z'), embarkationDate, disembarkationDate),
      ).toThrow(ConflictException);
    });

    it('lanca ConflictException para uma data depois do desembarque', () => {
      expect(() =>
        assertDateWithinCruise(new Date('2027-03-18T00:00:00.000Z'), embarkationDate, disembarkationDate),
      ).toThrow(ConflictException);
    });
  });
});
