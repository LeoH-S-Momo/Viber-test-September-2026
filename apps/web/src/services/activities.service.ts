import type { ReserveDiningInput, ReserveEventInput } from '@seapass/contracts';
import { authFetchJson, type ServiceResult } from '@/lib/api-client';
import type { DiningReservation, EventReservation } from '@/types/activity';

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
