'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LogIn } from 'lucide-react';
import { Container } from '@/components/ui/container';
import { buttonVariants } from '@/components/ui/button-styles';
import { useAuth } from '@/lib/auth-context';

/** Redireciona pra onde faz sentido pra cada papel — ver ADR-0013/0016. */
function redirectPathFor(roles: Array<{ key: string }>): string {
  if (roles.some((r) => r.key === 'ORGANIZER_ADMIN')) {
    return '/organizador/dashboard';
  }
  if (roles.some((r) => r.key === 'ORGANIZER_STAFF')) {
    return '/organizador/check-in';
  }
  if (roles.some((r) => r.key === 'PLATFORM_ADMIN')) {
    return '/admin/usuarios';
  }
  return '/ingressos';
}

/**
 * So aceita um `?redirect=` que seja um caminho interno de verdade — nunca
 * uma URL absoluta/protocol-relative (`//host/...`), que mandaria o usuario
 * pra fora do site depois de logar (open redirect).
 */
function isSafeRedirect(path: string | null): path is string {
  return !!path && path.startsWith('/') && !path.startsWith('//');
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

/** Separado do default export pra `useSearchParams()` (le o `?redirect=`) ficar dentro do Suspense exigido pelo Next 15. */
function LoginForm() {
  const { login, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      router.replace(isSafeRedirect(redirect) ? redirect : redirectPathFor(user.roles));
    }
  }, [user, router, redirect]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await login(email, password);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    // O redirecionamento acontece no proximo render, quando `user` ja estiver preenchido (acima).
  }

  return (
    <Container className="flex min-h-[70vh] items-center justify-center py-16">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-700 text-white">
            <LogIn className="h-5 w-5" aria-hidden="true" />
          </span>
          <h1 className="font-display text-xl font-bold text-slate-900">Entrar no SeaPass</h1>
          <p className="mt-1 text-sm text-slate-500">Passageiro, organizador ou staff — mesmo login.</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium text-slate-700">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium text-slate-700">
              Senha
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className={buttonVariants({ variant: 'primary', className: 'mt-2 w-full' })}
          >
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </Container>
  );
}
