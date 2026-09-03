import { getApiBaseUrl, safeFetchJsonOrNull, type ServiceResult } from '@/lib/api-client';
import type { CruiseDeckMap } from '@/types/ship-map';

/** `data: null` (sucesso) significa "cruzeiro nao encontrado/nao publicado" — mesma convencao de getCruiseBySlug. */
export async function getCruiseDeckMap(slug: string): Promise<ServiceResult<CruiseDeckMap | null>> {
  const url = `${getApiBaseUrl()}/cruises/${encodeURIComponent(slug)}/deck-map`;
  return safeFetchJsonOrNull<CruiseDeckMap>(url);
}
