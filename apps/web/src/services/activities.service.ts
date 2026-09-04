import type { ReserveDiningInput, ReserveEventInput } from '@seapass/contracts';
import { getApiBaseUrl, type ServiceResult } from '@/lib/api-client';
import type { ActivityAvailability, DiningReservation, EventReservation } from '@/types/activity';

/** Fetch autenticado — usado so por client components (o token so existe em memoria, ver AuthProvider). */
async function authFetchJson<T>(path: string, accessToken: string, init: RequestInit = {}): Promise<ServiceResult<T>> {
  try {
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Bearer ${accessToken}`,
        ...init.headers,
      },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      return { ok: false, message: body?.message ?? `A API respondeu com status ${response.status}.`, status: response.status };
    }
    const data = (await response.json()) as T;
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? `Nao foi possivel conectar a API: ${error.message}` : 'Nao foi possivel conectar a API.',
    };
  }
}

export async function reserveEvent(
  accessToken: string,
  bookingId: string,
  eventId: string,
  input: ReserveEventInput,
): Promise<ServiceResult<EventReservation>> {
  return authFetchJson<EventReservation>(`/bookings/${bookingId}/event-reservations/${eventId}`, accessToken, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function cancelEventReservation(
  accessToken: string,
  bookingId: string,
  reservationId: string,
): Promise<ServiceResult<EventReservation>> {
  return authFetchJson<EventReservation>(`/bookings/${bookingId}/event-reservations/${reservationId}/cancel`, accessToken, {
    method: 'POST',
  });
}

export async function reserveDining(
  accessToken: string,
  bookingId: string,
  input: ReserveDiningInput,
): Promise<ServiceResult<DiningReservation>> {
  return authFetchJson<DiningReservation>(`/bookings/${bookingId}/dining-reservations`, accessToken, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function cancelDiningReservation(
  accessToken: string,
  bookingId: string,
  reservationId: string,
): Promise<ServiceResult<DiningReservation>> {
  return authFetchJson<DiningReservation>(`/bookings/${bookingId}/dining-reservations/${reservationId}/cancel`, accessToken, {
    method: 'POST',
  });
}

/** Publico (sem token) — usado tanto pro seletor de eventos quanto, com uma data, pro de restaurantes. */
async function publicFetchJson<T>(path: string): Promise<ServiceResult<T>> {
  try {
    const response = await fetch(`${getApiBaseUrl()}${path}`);
    if (!response.ok) {
      return { ok: false, message: `A API respondeu com status ${response.status}.`, status: response.status };
    }
    return { ok: true, data: (await response.json()) as T };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? `Nao foi possivel conectar a API: ${error.message}` : 'Nao foi possivel conectar a API.',
    };
  }
}

export async function getEventAvailability(eventId: string): Promise<ServiceResult<ActivityAvailability>> {
  return publicFetchJson<ActivityAvailability>(`/events/${eventId}/availability`);
}

export async function getDiningAvailability(diningSlotId: string, date: string): Promise<ServiceResult<ActivityAvailability>> {
  return publicFetchJson<ActivityAvailability>(`/dining-slots/${diningSlotId}/availability?date=${encodeURIComponent(date)}`);
}
