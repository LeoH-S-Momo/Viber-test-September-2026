import type { CruiseDetail, CruiseSearchParams, CruiseSummary, PaginatedResult } from '@/types/cruise';

/**
 * Server Components rodam no processo Node do Next, nao no browser — usar a
 * URL interna evita um round-trip desnecessario via rede publica quando API
 * e web estao na mesma infraestrutura (em producao atras do mesmo
 * balanceador/rede privada). Em dev os dois valores sao iguais.
 */
function getApiBaseUrl(): string {
  const url =
    typeof window === 'undefined'
      ? (process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL)
      : process.env.NEXT_PUBLIC_API_URL;

  if (!url) {
    throw new Error('NEXT_PUBLIC_API_URL não está configurada (ver apps/web/.env.example).');
  }
  return url;
}

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; message: string };

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

async function safeFetchJson<T>(url: string): Promise<ServiceResult<T>> {
  try {
    const response = await fetch(url, { next: { revalidate: 30 } });

    if (!response.ok) {
      return { ok: false, message: `A API respondeu com status ${response.status}.` };
    }

    const data = (await response.json()) as T;
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? `Não foi possível conectar à API: ${error.message}`
          : 'Não foi possível conectar à API.',
    };
  }
}

export async function listCruises(
  params: CruiseSearchParams,
): Promise<ServiceResult<PaginatedResult<CruiseSummary>>> {
  const qs = buildQueryString(params);
  return safeFetchJson<PaginatedResult<CruiseSummary>>(`${getApiBaseUrl()}/cruises${qs}`);
}

/** `data: null` (sucesso) significa "nao encontrado/nao publicado" — distinto de `ok: false` (falha de rede/API). */
export async function getCruiseBySlug(slug: string): Promise<ServiceResult<CruiseDetail | null>> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/cruises/${encodeURIComponent(slug)}`, {
      next: { revalidate: 30 },
    });

    if (response.status === 404) {
      return { ok: true, data: null };
    }
    if (!response.ok) {
      return { ok: false, message: `A API respondeu com status ${response.status}.` };
    }

    const data = (await response.json()) as CruiseDetail;
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? `Não foi possível conectar à API: ${error.message}`
          : 'Não foi possível conectar à API.',
    };
  }
}
