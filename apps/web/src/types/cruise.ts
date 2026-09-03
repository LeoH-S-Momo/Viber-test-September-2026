import type { PaginationMeta } from '@seapass/contracts';

/**
 * Tipos do que a API realmente retorna nas rotas de leitura do catalogo
 * (`GET /cruises`, `GET /cruises/:slug`). Nao sao schemas Zod como os DTOs
 * de escrita — sao dados de exibicao, e o formato e controlado pelo mesmo
 * time/monorepo dos dois lados; validar em runtime aqui teria custo sem
 * ganho real de seguranca (ver docs/architecture/decisions/0007-public-frontend.md).
 */

export interface Port {
  id: string;
  name: string;
  country: string;
  unLocode: string | null;
  timezone: string | null;
}

export interface ItineraryStop {
  id: string;
  dayNumber: number;
  isEmbarkation: boolean;
  isDisembarkation: boolean;
  arrivalAt: string | null;
  departureAt: string | null;
  port: Port | null;
}

export interface CabinCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  maxOccupancy: number;
  sizeSqm: string | null;
}

export interface CruiseCabinPricing {
  id: string;
  price: string;
  currency: string;
  cancellationPolicy: string | null;
  cabinCategory: CabinCategory;
}

export interface Artist {
  id: string;
  name: string;
  bio: string | null;
  imageUrl: string | null;
}

export interface Venue {
  id: string;
  name: string;
  description: string | null;
  capacity: number | null;
}

export interface CruiseEvent {
  id: string;
  title: string;
  description: string | null;
  category: string;
  startAt: string;
  endAt: string;
  capacity: number | null;
  isIncluded: boolean;
  price: string | null;
  venue: Venue;
  artist: Artist | null;
}

export interface Experience {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  price: string | null;
  capacity: number | null;
  isIncluded: boolean;
}

export interface DiningSlot {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  capacity: number;
}

export interface Restaurant {
  id: string;
  name: string;
  description: string | null;
  cuisineType: string | null;
  isIncluded: boolean;
  diningSlots: DiningSlot[];
}

export interface CruiseShip {
  id: string;
  name: string;
  description: string | null;
  passengerCapacity: number;
  yearBuilt: number | null;
  venues: Venue[];
  restaurants: Restaurant[];
}

export interface CruiseOrganizer {
  id: string;
  name: string;
  slug?: string;
}

export interface CruiseSummary {
  id: string;
  title: string;
  slug: string;
  theme: string;
  status: string;
  coverImageUrl: string | null;
  embarkationDate: string;
  disembarkationDate: string;
  ship: { name: string };
  organizer: CruiseOrganizer;
  embarkationPort: { name: string; country: string } | null;
  cabinPricings: Array<{ price: string }>;
}

export interface CruiseDetail {
  id: string;
  title: string;
  slug: string;
  theme: string;
  description: string | null;
  status: string;
  coverImageUrl: string | null;
  embarkationDate: string;
  disembarkationDate: string;
  ship: CruiseShip;
  organizer: CruiseOrganizer;
  embarkationPort: Port;
  disembarkationPort: Port;
  itineraryStops: ItineraryStop[];
  cabinPricings: CruiseCabinPricing[];
  events: CruiseEvent[];
  experiences: Experience[];
}

export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMeta;
}

export type CruiseSortBy = 'embarkationDate' | 'title' | 'createdAt' | 'price';
export type SortOrder = 'asc' | 'desc';

export interface CruiseSearchParams {
  q?: string;
  theme?: string;
  destination?: string;
  embarkationFrom?: string;
  embarkationTo?: string;
  minPrice?: string;
  maxPrice?: string;
  sortBy?: CruiseSortBy;
  sortOrder?: SortOrder;
  page?: string;
  pageSize?: string;
}
