import { authFetchJson, type ServiceResult } from '@/lib/api-client';
import type { BookingHold, MyBooking } from '@/types/booking';

export interface GuestFormInput {
  fullName: string;
  documentType: 'PASSPORT' | 'NATIONAL_ID';
  documentNumber: string;
  isPrimary: boolean;
}

export async function getMyBookings(accessToken: string): Promise<ServiceResult<MyBooking[]>> {
  return authFetchJson<MyBooking[]>('/bookings/me', accessToken);
}

/** "Seleciona cabine" — cria o hold (janela curta, ver CABIN_HOLD_MINUTES no backend). */
export async function holdCabin(accessToken: string, cruiseSlug: string, cabinId: string): Promise<ServiceResult<BookingHold>> {
  return authFetchJson<BookingHold>(`/cruises/${cruiseSlug}/cabins/${cabinId}/hold`, accessToken, { method: 'POST' });
}

/** "Informa passageiros" — substitui hospedes/adicionais por completo (PUT idempotente). */
export async function updateBookingDetails(
  accessToken: string,
  bookingId: string,
  input: { guests: GuestFormInput[]; experienceIds?: string[]; couponCode?: string },
): Promise<ServiceResult<BookingHold>> {
  return authFetchJson<BookingHold>(`/bookings/${bookingId}/details`, accessToken, {
    method: 'PUT',
    body: JSON.stringify({ guests: input.guests, experienceIds: input.experienceIds ?? [], couponCode: input.couponCode }),
  });
}

export async function checkoutBooking(
  accessToken: string,
  bookingId: string,
  paymentMethod: 'CREDIT_CARD' | 'PIX' | 'BOLETO',
): Promise<ServiceResult<BookingHold>> {
  return authFetchJson<BookingHold>(`/bookings/${bookingId}/checkout`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ paymentMethod }),
  });
}

/** Desiste do hold antes do checkout — libera a cabine na hora em vez de esperar a expiracao. */
export async function releaseHold(accessToken: string, bookingId: string): Promise<ServiceResult<void>> {
  return authFetchJson<void>(`/bookings/${bookingId}/release`, accessToken, { method: 'POST' });
}
