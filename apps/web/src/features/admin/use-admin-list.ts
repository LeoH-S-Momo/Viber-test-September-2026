import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import type { ServiceResult } from '@/lib/api-client';
import type { PaginatedResult } from '@/types/cruise';

export type LoadState<T> =
  | { status: 'loading' }
  | { status: 'ready'; result: ServiceResult<T> };

/**
 * Estado comum aos 13 modulos do painel admin (busca + filtros + paginacao):
 * recarrega sempre que `filters` ou `page` mudam, e volta pra pagina 1
 * sempre que um filtro muda via `updateFilter` (nunca via `setPage` direto).
 */
export function useAdminList<T, F extends object>(
  fetcher: (accessToken: string, filters: F, page: number) => Promise<ServiceResult<PaginatedResult<T>>>,
  initialFilters: F,
) {
  const { accessToken } = useAuth();
  const [filters, setFilters] = useState<F>(initialFilters);
  const [page, setPage] = useState(1);
  const [state, setState] = useState<LoadState<PaginatedResult<T>>>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const updateFilter = useCallback((patch: Partial<F>) => {
    setPage(1);
    setFilters((current) => ({ ...current, ...patch }));
  }, []);

  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setState({ status: 'loading' });
    fetcherRef.current(accessToken, filters, page).then((result) => {
      if (!cancelled) setState({ status: 'ready', result });
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken, filters, page, reloadToken]);

  return { state, page, setPage, filters, updateFilter, reload };
}
