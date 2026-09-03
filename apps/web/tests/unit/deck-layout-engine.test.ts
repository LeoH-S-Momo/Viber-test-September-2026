import { describe, expect, it } from 'vitest';
import { computeDeckLayout } from '@/features/ship-map/layout/deck-layout-engine';
import { SAFE_BAND } from '@/features/ship-map/layout/hull-shape';
import type { CabinCategory } from '@/types/cruise';
import type { DeckMapCabin, DeckMapDeck, DeckMapRestaurant, DeckMapVenue } from '@/types/ship-map';

const CATEGORY: CabinCategory = {
  id: 'cat-1',
  name: 'Externa',
  slug: 'externa',
  description: null,
  maxOccupancy: 2,
  sizeSqm: '17',
};

function makeCabin(code: string, overrides: Partial<DeckMapCabin> = {}): DeckMapCabin {
  return {
    id: `cabin-${code}`,
    code,
    cabinCategory: CATEGORY,
    price: '2800',
    currency: 'BRL',
    availability: 'AVAILABLE',
    ...overrides,
  };
}

function makeVenue(id: string, name: string, capacity: number | null = 100): DeckMapVenue {
  return { id, name, description: null, capacity, type: 'LOUNGE' };
}

function makeRestaurant(id: string, name: string): DeckMapRestaurant {
  return { id, name, description: null, cuisineType: null, isIncluded: true };
}

function makeDeck(overrides: Partial<DeckMapDeck> = {}): DeckMapDeck {
  return {
    id: 'deck-1',
    number: 6,
    name: 'Deck 6',
    description: null,
    cabins: [],
    venues: [],
    restaurants: [],
    ...overrides,
  };
}

describe('computeDeckLayout', () => {
  it('returns empty layouts for a deck with nothing on it', () => {
    const layout = computeDeckLayout(makeDeck());
    expect(layout.cabins).toEqual([]);
    expect(layout.facilities).toEqual([]);
    expect(layout.hullPath).toMatch(/^M /);
  });

  it('places every cabin fully inside the safe band, with no negative size', () => {
    const cabins = Array.from({ length: 6 }, (_, i) => makeCabin(String(6201 + i)));
    const layout = computeDeckLayout(makeDeck({ cabins }));

    expect(layout.cabins).toHaveLength(6);
    for (const { rect } of layout.cabins) {
      expect(rect.width).toBeGreaterThan(0);
      expect(rect.height).toBeGreaterThan(0);
      expect(rect.x).toBeGreaterThanOrEqual(SAFE_BAND.x0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(SAFE_BAND.x1 + 0.01);
      expect(rect.y).toBeGreaterThanOrEqual(SAFE_BAND.y0);
      expect(rect.y + rect.height).toBeLessThanOrEqual(SAFE_BAND.y1 + 0.01);
    }
  });

  it('splits cabins evenly between the two strips (port/starboard)', () => {
    const cabins = Array.from({ length: 6 }, (_, i) => makeCabin(String(6201 + i)));
    const layout = computeDeckLayout(makeDeck({ cabins }));

    const distinctYs = new Set(layout.cabins.map((c) => c.rect.y));
    expect(distinctYs.size).toBe(2);
  });

  it('keeps cabins from the same category adjacent even if the input order is interleaved', () => {
    const categoryA: CabinCategory = { ...CATEGORY, id: 'cat-a', name: 'A' };
    const categoryB: CabinCategory = { ...CATEGORY, id: 'cat-b', name: 'B' };
    const cabins = [
      makeCabin('1', { cabinCategory: categoryA }),
      makeCabin('2', { cabinCategory: categoryB }),
      makeCabin('3', { cabinCategory: categoryA }),
      makeCabin('4', { cabinCategory: categoryB }),
    ];
    const layout = computeDeckLayout(makeDeck({ cabins }));

    const categoryOrder = layout.cabins.map((c) => c.cabin.cabinCategory.id);
    // Agrupado: todas as "cat-a" antes de todas as "cat-b" (ou vice-versa),
    // nunca alternando a-b-a-b como na entrada.
    const firstSwitch = categoryOrder.findIndex((id, i) => i > 0 && id !== categoryOrder[i - 1]);
    const remaining = categoryOrder.slice(firstSwitch);
    expect(remaining.every((id) => id === remaining[0])).toBe(true);
  });

  it('does not overflow the strip width even with a single cabin (clamped, centered)', () => {
    const layout = computeDeckLayout(makeDeck({ cabins: [makeCabin('9901')] }));
    expect(layout.cabins).toHaveLength(1);
    const rect = layout.cabins[0]!.rect;
    expect(rect.width).toBeLessThanOrEqual(60);
    expect(rect.x).toBeGreaterThan(SAFE_BAND.x0);
  });

  it('packs venues and restaurants into non-overlapping rows within the safe band', () => {
    const venues = [makeVenue('v1', 'Teatro Ondas', 500), makeVenue('v2', 'Lounge Riff', 150)];
    const restaurants = [makeRestaurant('r1', 'Restaurante Harmonia')];
    const layout = computeDeckLayout(makeDeck({ venues, restaurants }));

    expect(layout.facilities).toHaveLength(3);
    for (const { rect } of layout.facilities) {
      expect(rect.x).toBeGreaterThanOrEqual(SAFE_BAND.x0 - 0.01);
      expect(rect.x + rect.width).toBeLessThanOrEqual(SAFE_BAND.x1 + 0.01);
      expect(rect.y).toBeGreaterThanOrEqual(SAFE_BAND.y0);
      expect(rect.y + rect.height).toBeLessThanOrEqual(SAFE_BAND.y1 + 0.01);
    }

    // Nenhum par de blocos deve se sobrepor (checagem simples de retangulos).
    for (let i = 0; i < layout.facilities.length; i += 1) {
      for (let j = i + 1; j < layout.facilities.length; j += 1) {
        const a = layout.facilities[i]!.rect;
        const b = layout.facilities[j]!.rect;
        const overlapsX = a.x < b.x + b.width && b.x < a.x + a.width;
        const overlapsY = a.y < b.y + b.height && b.y < a.y + a.height;
        expect(overlapsX && overlapsY).toBe(false);
      }
    }
  });

  it('gives facilities the full safe band height when the deck has no cabins', () => {
    const withCabins = computeDeckLayout(
      makeDeck({ cabins: [makeCabin('1')], venues: [makeVenue('v1', 'Teatro')] }),
    );
    const withoutCabins = computeDeckLayout(makeDeck({ venues: [makeVenue('v1', 'Teatro')] }));

    expect(withoutCabins.facilities[0]!.rect.height).toBeGreaterThan(
      withCabins.facilities[0]!.rect.height,
    );
  });

  it('is deterministic — same input always produces the same output', () => {
    const deck = makeDeck({
      cabins: [makeCabin('1'), makeCabin('2')],
      venues: [makeVenue('v1', 'Bar Maré Alta', 60)],
    });
    expect(computeDeckLayout(deck)).toEqual(computeDeckLayout(deck));
  });
});
