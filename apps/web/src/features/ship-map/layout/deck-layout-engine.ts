import { DECK_VIEWBOX, HULL_PATH, SAFE_BAND } from './hull-shape';
import type { DeckMapCabin, DeckMapDeck, DeckMapRestaurant, DeckMapVenue } from '@/types/ship-map';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PositionedCabin {
  cabin: DeckMapCabin;
  rect: Rect;
}

export type FacilityItem =
  | { kind: 'venue'; id: string; name: string; venue: DeckMapVenue }
  | { kind: 'restaurant'; id: string; name: string; restaurant: DeckMapRestaurant };

export interface PositionedFacility {
  item: FacilityItem;
  rect: Rect;
}

export interface DeckLayout {
  viewBox: typeof DECK_VIEWBOX;
  hullPath: string;
  cabins: PositionedCabin[];
  facilities: PositionedFacility[];
}

const GAP = 5;
const CABIN_MIN_WIDTH = 22;
const CABIN_MAX_WIDTH = 60;
const STRIP_HEIGHT = 56;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Mesma categoria fica sempre agrupada (cabines vizinhas na planta) — o
 * dado de entrada ja costuma vir ordenado por `code`, so reordenamos por
 * categoria de forma estavel para o caso (futuro) de um deck misturar mais
 * de uma categoria.
 */
function groupByCategory(cabins: DeckMapCabin[]): DeckMapCabin[] {
  const seen = new Map<string, DeckMapCabin[]>();
  for (const cabin of cabins) {
    const key = cabin.cabinCategory.id;
    const group = seen.get(key);
    if (group) {
      group.push(cabin);
    } else {
      seen.set(key, [cabin]);
    }
  }
  return Array.from(seen.values()).flat();
}

function layoutCabinStrip(cabins: DeckMapCabin[], stripRect: Rect): PositionedCabin[] {
  const n = cabins.length;
  if (n === 0) return [];

  const available = stripRect.width;
  const rawWidth = (available - GAP * (n - 1)) / n;
  const width = clamp(rawWidth, CABIN_MIN_WIDTH, CABIN_MAX_WIDTH);
  const totalWidth = width * n + GAP * (n - 1);
  const startX = stripRect.x + Math.max(0, (available - totalWidth) / 2);

  return cabins.map((cabin, index) => ({
    cabin,
    rect: {
      x: startX + index * (width + GAP),
      y: stripRect.y,
      width,
      height: stripRect.height,
    },
  }));
}

/** Divide a sequencia de cabines (ja agrupada por categoria) em duas metades — bombordo/boreste. */
function layoutCabins(cabins: DeckMapCabin[]): PositionedCabin[] {
  const grouped = groupByCategory(cabins);
  const mid = Math.ceil(grouped.length / 2);
  const port = grouped.slice(0, mid);
  const starboard = grouped.slice(mid);

  const portStrip: Rect = {
    x: SAFE_BAND.x0,
    y: SAFE_BAND.y0 + 10,
    width: SAFE_BAND.x1 - SAFE_BAND.x0,
    height: STRIP_HEIGHT,
  };
  const starboardStrip: Rect = {
    x: SAFE_BAND.x0,
    y: SAFE_BAND.y1 - 10 - STRIP_HEIGHT,
    width: SAFE_BAND.x1 - SAFE_BAND.x0,
    height: STRIP_HEIGHT,
  };

  return [...layoutCabinStrip(port, portStrip), ...layoutCabinStrip(starboard, starboardStrip)];
}

function facilityWidth(item: FacilityItem): number {
  if (item.kind === 'restaurant') {
    return 130;
  }
  const capacity = item.venue.capacity ?? 80;
  return clamp(70 + Math.sqrt(capacity) * 8, 80, 220);
}

/**
 * Empacotamento simples "em prateleiras": preenche uma linha da esquerda pra
 * direita, quebra pra proxima linha quando nao cabe mais. Nao e otimo (bin
 * packing real e NP-difícil), mas e determinístico, legivel e mais que
 * suficiente pra meia duzia de venues/restaurantes por deck.
 */
function packFacilities(items: FacilityItem[], area: Rect): PositionedFacility[] {
  if (items.length === 0) return [];

  const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const rows: Array<Array<{ item: FacilityItem; width: number }>> = [];
  let currentRow: Array<{ item: FacilityItem; width: number }> = [];
  let currentRowWidth = 0;

  for (const item of sorted) {
    const width = facilityWidth(item);
    const additional = currentRow.length > 0 ? GAP + width : width;
    if (currentRow.length > 0 && currentRowWidth + additional > area.width) {
      rows.push(currentRow);
      currentRow = [];
      currentRowWidth = 0;
    }
    currentRow.push({ item, width });
    currentRowWidth += currentRow.length > 1 ? GAP + width : width;
  }
  if (currentRow.length > 0) rows.push(currentRow);

  const rowHeight = Math.max(50, (area.height - GAP * (rows.length - 1)) / rows.length);
  const positioned: PositionedFacility[] = [];

  rows.forEach((row, rowIndex) => {
    const rowWidth = row.reduce((sum, entry) => sum + entry.width, 0) + GAP * (row.length - 1);
    let x = area.x + Math.max(0, (area.width - rowWidth) / 2);
    const y = area.y + rowIndex * (rowHeight + GAP);
    for (const { item, width } of row) {
      positioned.push({ item, rect: { x, y, width, height: rowHeight } });
      x += width + GAP;
    }
  });

  return positioned;
}

function toFacilityItems(venues: DeckMapVenue[], restaurants: DeckMapRestaurant[]): FacilityItem[] {
  return [
    ...venues.map((venue): FacilityItem => ({ kind: 'venue', id: venue.id, name: venue.name, venue })),
    ...restaurants.map(
      (restaurant): FacilityItem => ({
        kind: 'restaurant',
        id: restaurant.id,
        name: restaurant.name,
        restaurant,
      }),
    ),
  ];
}

/**
 * Funcao pura: dado um deck (dados do catalogo), calcula onde cada cabine e
 * instalacao aparece na planta em coordenadas normalizadas (viewBox fixo,
 * ver DECK_VIEWBOX). Zero React, zero DOM — testavel isoladamente (ver
 * deck-layout-engine.test.ts) e reutilizavel por qualquer forma de render.
 */
export function computeDeckLayout(deck: DeckMapDeck): DeckLayout {
  const cabins = layoutCabins(deck.cabins);
  const hasCabins = deck.cabins.length > 0;

  // Sem cabines no deck, a area de instalacoes pode usar o casco inteiro em
  // vez de ficar espremida entre duas faixas de cabine vazias.
  const facilityArea: Rect = hasCabins
    ? {
        x: SAFE_BAND.x0,
        y: SAFE_BAND.y0 + 10 + STRIP_HEIGHT + GAP * 3,
        width: SAFE_BAND.x1 - SAFE_BAND.x0,
        height: SAFE_BAND.y1 - SAFE_BAND.y0 - 2 * (10 + STRIP_HEIGHT + GAP * 3),
      }
    : {
        x: SAFE_BAND.x0,
        y: SAFE_BAND.y0 + 15,
        width: SAFE_BAND.x1 - SAFE_BAND.x0,
        height: SAFE_BAND.y1 - SAFE_BAND.y0 - 30,
      };

  const facilities = packFacilities(toFacilityItems(deck.venues, deck.restaurants), facilityArea);

  return {
    viewBox: DECK_VIEWBOX,
    hullPath: HULL_PATH,
    cabins,
    facilities,
  };
}
