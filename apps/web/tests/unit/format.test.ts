import { describe, expect, it } from 'vitest';
import {
  durationInNights,
  formatDate,
  formatDateRange,
  formatDayMonth,
  formatDuration,
  formatPrice,
  formatTime,
  minPrice,
} from '@/lib/format';

describe('formatPrice', () => {
  it('formats a numeric string as BRL currency without decimals', () => {
    expect(formatPrice('2200.00')).toBe('R$ 2.200');
  });

  it('formats a plain number the same way', () => {
    expect(formatPrice(9999)).toBe('R$ 9.999');
  });
});

describe('formatDate', () => {
  it('formats an ISO date in pt-BR day/month/year style', () => {
    expect(formatDate('2026-11-10T16:00:00.000Z')).toMatch(/10 de nov\. de 2026/);
  });
});

describe('formatDayMonth', () => {
  it('formats only day and month', () => {
    expect(formatDayMonth('2026-11-10T16:00:00.000Z')).toMatch(/10 de nov\./);
  });
});

describe('formatTime', () => {
  it('reads the wall-clock hour from a dining-slot-style UTC datetime', () => {
    expect(formatTime('1970-01-01T19:30:00.000Z')).toBe('19:30');
  });
});

describe('formatDateRange', () => {
  it('joins two formatted dates with an en dash', () => {
    const range = formatDateRange('2026-11-10T16:00:00.000Z', '2026-11-15T09:00:00.000Z');
    expect(range).toContain('–');
    expect(range).toMatch(/10 de nov\. de 2026/);
    expect(range).toMatch(/15 de nov\. de 2026/);
  });
});

describe('durationInNights', () => {
  it('computes whole nights between two dates', () => {
    expect(durationInNights('2026-11-10T16:00:00.000Z', '2026-11-15T09:00:00.000Z')).toBe(5);
  });

  it('never returns a negative duration', () => {
    expect(durationInNights('2026-11-15T00:00:00.000Z', '2026-11-10T00:00:00.000Z')).toBe(0);
  });
});

describe('formatDuration', () => {
  it('pluralizes "noites" for more than one night', () => {
    expect(formatDuration('2026-11-10T00:00:00.000Z', '2026-11-15T00:00:00.000Z')).toBe('5 noites');
  });

  it('uses the singular "noite" for exactly one night', () => {
    expect(formatDuration('2026-11-10T00:00:00.000Z', '2026-11-11T00:00:00.000Z')).toBe('1 noite');
  });
});

describe('minPrice', () => {
  it('returns the lowest price among cabin pricings', () => {
    expect(minPrice([{ price: '2800' }, { price: '2200' }, { price: '3600' }])).toBe(2200);
  });

  it('returns null when there are no pricings', () => {
    expect(minPrice([])).toBeNull();
  });
});
