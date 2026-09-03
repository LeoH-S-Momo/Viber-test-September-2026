import { getApiBaseUrl, safeFetchJson, safeFetchJsonOrNull, type ServiceResult } from '@/lib/api-client';
import type { CruiseDetail, CruiseSearchParams, CruiseSummary, PaginatedResult } from '@/types/cruise';

export type { ServiceResult };

function buildQueryString(params: CruiseSearchParams & { page?: string }): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      search.set(key, value);
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export async function listCruises(
  params: CruiseSearchParams,
): Promise<ServiceResult<PaginatedResult<CruiseSummary>>> {
  const qs = buildQueryString(params);
  return safeFetchJson<PaginatedResult<CruiseSummary>>(`${getApiBaseUrl()}/cruises${qs}`);
}

/** `data: null` (sucesso) significa "nao encontrado/nao publicado" — distinto de `ok: false` (falha de rede/API). */
export async function getCruiseBySlug(slug: string): Promise<ServiceResult<CruiseDetail | null>> {
  return safeFetchJsonOrNull<CruiseDetail>(`${getApiBaseUrl()}/cruises/${encodeURIComponent(slug)}`);
}
