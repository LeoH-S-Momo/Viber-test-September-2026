import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import type { ServiceResult } from '@/lib/api-client';

/** Busca o detalhe de um recurso por id — usado pelos 13 modais de "Detalhes" do painel admin. */
export function useAdminDetail<T>(fetcher: (accessToken: string, id: string) => Promise<ServiceResult<T>>, id: string) {
  const { accessToken } = useAuth();
  const [detail, setDetail] = useState<T | 'loading' | 'error'>('loading');
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setDetail('loading');
    // Guarda contra resposta fora de ordem (mesmo padrao de use-admin-list.ts) — sem isto, se
    // `id` mudasse com o modal ainda montado, uma resposta lenta do `id` antigo podia chegar
    // DEPOIS da busca do `id` novo e sobrescrever o painel com a entidade errada.
    fetcherRef.current(accessToken, id).then((result) => {
      if (!cancelled) setDetail(result.ok ? result.data : 'error');
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken, id]);

  return detail;
}
