import { authFetchJson, type ServiceResult } from '@/lib/api-client';
import type { CheckInLookupResult, CheckInTicketView, MyTicket } from '@/types/ticket';

export async function getMyTickets(accessToken: string): Promise<ServiceResult<MyTicket[]>> {
  return authFetchJson<MyTicket[]>('/tickets/me', accessToken);
}

export async function lookupCheckIn(accessToken: string, code: string): Promise<ServiceResult<CheckInLookupResult>> {
  return authFetchJson<CheckInLookupResult>('/check-in/lookup', accessToken, {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export async function confirmCheckIn(
  accessToken: string,
  code: string,
  location?: string,
): Promise<ServiceResult<CheckInTicketView>> {
  return authFetchJson<CheckInTicketView>('/check-in/confirm', accessToken, {
    method: 'POST',
    body: JSON.stringify({ code, location }),
  });
}
