import type { CabinCategory } from './cruise';

/**
 * Estado de disponibilidade de uma cabine PARA UM cruzeiro especifico —
 * espelha CabinAvailabilityPolicy no backend (apps/api/.../domain).
 */
export type CabinAvailability = 'AVAILABLE' | 'ON_HOLD' | 'BOOKED' | 'UNAVAILABLE';

export type VenueType = 'THEATER' | 'LOUNGE' | 'BAR' | 'POOL' | 'LEISURE' | 'OTHER';

export interface DeckMapCabin {
  id: string;
  code: string;
  cabinCategory: CabinCategory;
  price: string | null;
  currency: string | null;
  availability: CabinAvailability;
}

export interface DeckMapVenue {
  id: string;
  name: string;
  description: string | null;
  capacity: number | null;
  type: VenueType;
}

export interface DeckMapRestaurant {
  id: string;
  name: string;
  description: string | null;
  cuisineType: string | null;
  isIncluded: boolean;
}

export interface DeckMapDeck {
  id: string;
  number: number;
  name: string | null;
  description: string | null;
  cabins: DeckMapCabin[];
  venues: DeckMapVenue[];
  restaurants: DeckMapRestaurant[];
}

export type CruiseDeckMap = DeckMapDeck[];

/** União usada pelos painéis de detalhe/tooltip — o que o usuário selecionou no mapa. */
export type DeckMapSelection =
  | { kind: 'cabin'; deck: DeckMapDeck; cabin: DeckMapCabin }
  | { kind: 'venue'; deck: DeckMapDeck; venue: DeckMapVenue }
  | { kind: 'restaurant'; deck: DeckMapDeck; restaurant: DeckMapRestaurant };
