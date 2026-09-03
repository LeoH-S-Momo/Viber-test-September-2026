/**
 * Server Components rodam no processo Node do Next, nao no browser — usar a
 * URL interna evita um round-trip desnecessario via rede publica quando API
 * e web estao na mesma infraestrutura (em producao atras do mesmo
 * balanceador/rede privada). Em dev os dois valores sao iguais.
 */
export function getApiBaseUrl(): string {
  const url =
    typeof window === 'undefined'
      ? (process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL)
      : process.env.NEXT_PUBLIC_API_URL;

  if (!url) {
    throw new Error('NEXT_PUBLIC_API_URL não está configurada (ver apps/web/.env.example).');
  }
  return url;
}

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; status?: number };

/** Envelope padrao de fetch para todos os services — nunca deixa uma falha de rede/API virar excecao nao tratada. */
export async function safeFetchJson<T>(url: string): Promise<ServiceResult<T>> {
  try {
    const response = await fetch(url, { next: { revalidate: 30 } });

    if (!response.ok) {
      return {
        ok: false,
        message: `A API respondeu com status ${response.status}.`,
        status: response.status,
      };
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

/**
 * Variante para endpoints publicos de catalogo onde 404 e um resultado
 * valido ("recurso nao existe/nao publicado", `data: null`), nao uma falha —
 * distinto de erro de rede/servidor (`ok: false`). Usado por qualquer
 * service que busca por slug (cruzeiro, mapa do navio, etc).
 */
export async function safeFetchJsonOrNull<T>(url: string): Promise<ServiceResult<T | null>> {
  const result = await safeFetchJson<T>(url);
  if (!result.ok && result.status === 404) {
    return { ok: true, data: null };
  }
  return result;
}
