'use client';

import { RefreshCw, ServerCrash } from 'lucide-react';
import { buttonVariants } from './button-styles';

export function ErrorState({
  title = 'Não foi possível carregar esta página',
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  /**
   * Sem isto, "Tentar novamente" chamava `router.refresh()` — no App Router isso só re-busca
   * dados de Server Component, preservando de propósito o estado de Client Component (onde
   * TODA a lógica de fetch desta tela realmente vive, ver `useEffect`s de cada página). O botão
   * ficava um no-op silencioso em toda tela que usa este componente (~30 no app). Passe o
   * `reload`/`load` da própria página quando existir; sem ele, cai num reload de verdade da
   * página inteira — mais pesado, mas GENUINAMENTE recupera (inclusive de uma sessão expirada).
   */
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-6 py-16 text-center"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-red-500 shadow-sm">
        <ServerCrash className="h-6 w-6" aria-hidden="true" />
      </div>
      <h3 className="font-display text-lg font-semibold text-red-900">{title}</h3>
      <p className="max-w-md text-sm text-red-700">{message}</p>
      <button
        type="button"
        onClick={() => (onRetry ? onRetry() : window.location.reload())}
        className={buttonVariants({ variant: 'outline', size: 'sm', className: 'mt-2' })}
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Tentar novamente
      </button>
    </div>
  );
}
