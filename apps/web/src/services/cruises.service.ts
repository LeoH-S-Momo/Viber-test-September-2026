import { getApiBaseUrl, qs, safeFetchJson, safeFetchJsonOrNull, type ServiceResult } from '@/lib/api-client';
import type { CruiseDetail, CruiseSearchParams, CruiseSummary, PaginatedResult } from '@/types/cruise';

export type { ServiceResult };

export async function listCruises(
  params: CruiseSearchParams,
): Promise<ServiceResult<PaginatedResult<CruiseSummary>>> {
  return safeFetchJson<PaginatedResult<CruiseSummary>>(`${getApiBaseUrl()}/cruises${qs(params)}`);
}

/** `data: null` (sucesso) significa "nao encontrado/nao publicado" — distinto de `ok: false` (falha de rede/API). */
export async function getCruiseBySlug(slug: string): Promise<ServiceResult<CruiseDetail | null>> {
  return safeFetchJsonOrNull<CruiseDetail>(`${getApiBaseUrl()}/cruises/${encodeURIComponent(slug)}`);
}
