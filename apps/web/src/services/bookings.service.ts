import { getApiBaseUrl, type ServiceResult } from '@/lib/api-client';
import type { MyBooking } from '@/types/booking';

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

export async function getMyBookings(accessToken: string): Promise<ServiceResult<MyBooking[]>> {
  return authFetchJson<MyBooking[]>('/bookings/me', accessToken);
}
