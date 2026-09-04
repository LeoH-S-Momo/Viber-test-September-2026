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
    setDetail('loading');
    fetcherRef.current(accessToken, id).then((result) => setDetail(result.ok ? result.data : 'error'));
  }, [accessToken, id]);

  return detail;
}
