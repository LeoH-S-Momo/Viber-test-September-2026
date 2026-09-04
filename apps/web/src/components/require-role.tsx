'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import type { AuthUserRole } from '@/types/auth';

/**
 * Guarda de rota client-side — o Next.js middleware nao tem acesso ao
 * cookie httpOnly de refresh sem uma chamada de rede, entao a checagem de
 * papel acontece depois da hidratacao (`useAuth` ja tentou o refresh
 * silencioso), nao antes. O DADO da pagina protegida nunca e buscado antes
 * dessa checagem (ver as paginas que usam este componente) — so a casca
 * inicial e servida sem garantia, que e aceitavel.
 */
export function RequireRole({ roles, children }: { roles: AuthUserRole['key'][]; children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const hasRole = user?.roles.some((role) => roles.includes(role.key)) ?? false;

  useEffect(() => {
    if (isLoading) return;
    if (!user || !hasRole) {
      router.replace('/login');
    }
  }, [isLoading, user, hasRole, router]);

  if (isLoading || !user || !hasRole) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
        {isLoading ? 'Carregando…' : 'Redirecionando…'}
      </div>
    );
  }

  return <>{children}</>;
}
