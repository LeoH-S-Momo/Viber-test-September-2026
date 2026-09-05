import type {
  CreateCruiseInput,
  CreateEventInput,
  CreateExperienceInput,
  CreateRestaurantInput,
  CreateShipInput,
  UpdateCruiseInput,
  UpdateEventInput,
  UpdateExperienceInput,
  UpdateRestaurantInput,
  UpdateShipInput,
} from '@seapass/contracts';
import { authFetchJson, getApiBaseUrl, qs, safeFetchJson, type ServiceResult } from '@/lib/api-client';
import type { CruiseDetail, CruiseSummary, PaginatedResult, Port } from '@/types/cruise';
import type {
  OrganizerBooking,
  OrganizerDashboard,
  OrganizerEvent,
  OrganizerExperience,
  OrganizerPassenger,
  OrganizerRestaurant,
  OrganizerShip,
} from '@/types/organizer';

export interface DashboardFilter {
  cruiseId?: string;
  from?: string;
  to?: string;
}

export function getDashboard(accessToken: string, filter: DashboardFilter): Promise<ServiceResult<OrganizerDashboard>> {
  return authFetchJson<OrganizerDashboard>(`/organizers/me/dashboard${qs(filter)}`, accessToken);
}

export interface BookingsFilter {
  cruiseId?: string;
  status?: string;
  page?: string;
}

export function getBookings(accessToken: string, filter: BookingsFilter): Promise<ServiceResult<PaginatedResult<OrganizerBooking>>> {
  return authFetchJson<PaginatedResult<OrganizerBooking>>(`/organizers/me/bookings${qs(filter)}`, accessToken);
}

export interface PassengersFilter {
  cruiseId?: string;
  q?: string;
  page?: string;
}

export function getPassengers(
  accessToken: string,
  filter: PassengersFilter,
): Promise<ServiceResult<PaginatedResult<OrganizerPassenger>>> {
  return authFetchJson<PaginatedResult<OrganizerPassenger>>(`/organizers/me/passengers${qs(filter)}`, accessToken);
}

export function getMyCruises(accessToken: string, filter: { page?: string } = {}): Promise<ServiceResult<PaginatedResult<CruiseSummary>>> {
  return authFetchJson<PaginatedResult<CruiseSummary>>(`/organizers/me/cruises${qs(filter)}`, accessToken);
}

export function getMyShips(accessToken: string): Promise<ServiceResult<OrganizerShip[]>> {
  return authFetchJson<OrganizerShip[]>('/organizers/me/ships', accessToken);
}

export function getMyEvents(accessToken: string, cruiseId?: string): Promise<ServiceResult<OrganizerEvent[]>> {
  return authFetchJson<OrganizerEvent[]>(`/organizers/me/events${qs({ cruiseId })}`, accessToken);
}

export function getMyRestaurants(accessToken: string): Promise<ServiceResult<OrganizerRestaurant[]>> {
  return authFetchJson<OrganizerRestaurant[]>('/organizers/me/restaurants', accessToken);
}

export function getMyExperiences(accessToken: string, cruiseId?: string): Promise<ServiceResult<OrganizerExperience[]>> {
  return authFetchJson<OrganizerExperience[]>(`/organizers/me/experiences${qs({ cruiseId })}`, accessToken);
}

export function getPorts(): Promise<ServiceResult<Port[] | PaginatedResult<Port>>> {
  return safeFetchJson<Port[] | PaginatedResult<Port>>(`${getApiBaseUrl()}/ports`);
}

export function getShipVenues(shipId: string): Promise<ServiceResult<Array<{ id: string; name: string }>>> {
  return safeFetchJson(`${getApiBaseUrl()}/ships/${shipId}/venues`);
}

export function getShipCabinCategories(
  shipId: string,
): Promise<ServiceResult<Array<{ id: string; name: string; maxOccupancy: number }>>> {
  return safeFetchJson(`${getApiBaseUrl()}/ships/${shipId}/cabin-categories`);
}

export function getArtists(): Promise<ServiceResult<Array<{ id: string; name: string }>>> {
  return safeFetchJson(`${getApiBaseUrl()}/artists`);
}

// --- Cruzeiros: criar/editar (o unico form explicitamente pedido, ver ADR-0016) ---

export function createCruise(accessToken: string, input: CreateCruiseInput): Promise<ServiceResult<CruiseDetail>> {
  return authFetchJson<CruiseDetail>('/cruises', accessToken, { method: 'POST', body: JSON.stringify(input) });
}

export function updateCruise(accessToken: string, id: string, input: UpdateCruiseInput): Promise<ServiceResult<CruiseDetail>> {
  return authFetchJson<CruiseDetail>(`/cruises/${id}`, accessToken, { method: 'PATCH', body: JSON.stringify(input) });
}

export function setCruisePricing(
  accessToken: string,
  cruiseId: string,
  input: { cabinCategoryId: string; price: number },
): Promise<ServiceResult<unknown>> {
  return authFetchJson(`/cruises/${cruiseId}/pricing`, accessToken, { method: 'POST', body: JSON.stringify(input) });
}

export function publishCruise(accessToken: string, id: string): Promise<ServiceResult<unknown>> {
  return authFetchJson(`/cruises/${id}/publish`, accessToken, { method: 'POST' });
}

export function unpublishCruise(accessToken: string, id: string): Promise<ServiceResult<unknown>> {
  return authFetchJson(`/cruises/${id}/unpublish`, accessToken, { method: 'POST' });
}

export function getCruiseById(accessToken: string, id: string): Promise<ServiceResult<CruiseDetail>> {
  return authFetchJson<CruiseDetail>(`/organizers/me/cruises/${id}`, accessToken);
}

// --- Navios ---

export function createShip(accessToken: string, input: CreateShipInput): Promise<ServiceResult<OrganizerShip>> {
  return authFetchJson<OrganizerShip>('/ships', accessToken, { method: 'POST', body: JSON.stringify(input) });
}

export function updateShip(accessToken: string, id: string, input: UpdateShipInput): Promise<ServiceResult<OrganizerShip>> {
  return authFetchJson<OrganizerShip>(`/ships/${id}`, accessToken, { method: 'PATCH', body: JSON.stringify(input) });
}

// --- Eventos ---

export function createEvent(accessToken: string, input: CreateEventInput): Promise<ServiceResult<OrganizerEvent>> {
  return authFetchJson<OrganizerEvent>('/events', accessToken, { method: 'POST', body: JSON.stringify(input) });
}

export function updateEvent(accessToken: string, id: string, input: UpdateEventInput): Promise<ServiceResult<OrganizerEvent>> {
  return authFetchJson<OrganizerEvent>(`/events/${id}`, accessToken, { method: 'PATCH', body: JSON.stringify(input) });
}

// --- Restaurantes ---

export function createRestaurant(
  accessToken: string,
  shipId: string,
  input: CreateRestaurantInput,
): Promise<ServiceResult<OrganizerRestaurant>> {
  return authFetchJson<OrganizerRestaurant>(`/ships/${shipId}/restaurants`, accessToken, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateRestaurant(
  accessToken: string,
  id: string,
  input: UpdateRestaurantInput,
): Promise<ServiceResult<OrganizerRestaurant>> {
  return authFetchJson<OrganizerRestaurant>(`/restaurants/${id}`, accessToken, { method: 'PATCH', body: JSON.stringify(input) });
}

// --- Experiencias ---

export function createExperience(accessToken: string, input: CreateExperienceInput): Promise<ServiceResult<OrganizerExperience>> {
  return authFetchJson<OrganizerExperience>('/experiences', accessToken, { method: 'POST', body: JSON.stringify(input) });
}

export function updateExperience(
  accessToken: string,
  id: string,
  input: UpdateExperienceInput,
): Promise<ServiceResult<OrganizerExperience>> {
  return authFetchJson<OrganizerExperience>(`/experiences/${id}`, accessToken, { method: 'PATCH', body: JSON.stringify(input) });
}
