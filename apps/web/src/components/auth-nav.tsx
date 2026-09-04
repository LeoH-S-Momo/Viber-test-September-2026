'use client';

import Link from 'next/link';
import { CalendarCheck, LayoutDashboard, LogIn, LogOut, ScanLine, ShieldCheck, Ticket as TicketIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

/** Ilha client-side no header (que e Server Component) — so aqui a sessao (memoria, ver AuthProvider) e lida. */
export function AuthNav() {
  const { user, isLoading, logout } = useAuth();

  async function handleLogout() {
    await logout();
    // Recarregamento completo, nao `router.push` — numa pagina protegida por
    // `<RequireRole>`, o efeito dela tambem reage a `user` virar null e
    // redireciona pra `/login`, brigando com uma navegacao client-side pra
    // `/` (o efeito sempre venceu nos testes, nao importa a ordem). Um
    // reload garante a tela inicial de verdade, e ja limpa qualquer estado
    // client remanescente da sessao anterior de quebra.
    window.location.href = '/';
  }

  if (isLoading) {
    return <span className="h-9 w-20" aria-hidden="true" />;
  }

  if (!user) {
    return (
      <Link
        href="/login"
        className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-brand-50 hover:text-brand-800 sm:px-4"
      >
        <LogIn className="h-4 w-4" aria-hidden="true" />
        Entrar
      </Link>
    );
  }

  const isAdmin = user.roles.some((r) => r.key === 'ORGANIZER_ADMIN');
  const isStaffOnly = !isAdmin && user.roles.some((r) => r.key === 'ORGANIZER_STAFF');
  const isPlatformAdmin = user.roles.some((r) => r.key === 'PLATFORM_ADMIN');
  const isOrganizer = isAdmin || isStaffOnly || isPlatformAdmin;

  return (
    <div className="flex items-center gap-1 sm:gap-2">
      {!isOrganizer && (
        <Link
          href="/reservas"
          className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-brand-50 hover:text-brand-800 sm:px-4"
        >
          <CalendarCheck className="h-4 w-4" aria-hidden="true" />
          Minha viagem
        </Link>
      )}
      {isAdmin && (
        <Link
          href="/organizador/dashboard"
          className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-brand-50 hover:text-brand-800 sm:px-4"
        >
          <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
          Painel
        </Link>
      )}
      {isPlatformAdmin && (
        <Link
          href="/admin/usuarios"
          className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-brand-50 hover:text-brand-800 sm:px-4"
        >
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          Painel Admin
        </Link>
      )}
      {!isAdmin && !isPlatformAdmin && (
        <Link
          href={isStaffOnly ? '/organizador/check-in' : '/ingressos'}
          className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-brand-50 hover:text-brand-800 sm:px-4"
        >
          {isStaffOnly ? <ScanLine className="h-4 w-4" aria-hidden="true" /> : <TicketIcon className="h-4 w-4" aria-hidden="true" />}
          {isStaffOnly ? 'Check-in' : 'Meus ingressos'}
        </Link>
      )}
      <span
        className="hidden max-w-[12rem] truncate text-sm text-slate-500 sm:inline"
        title={user.email}
      >
        {user.email}
      </span>
      <button
        type="button"
        onClick={handleLogout}
        className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 sm:px-4"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        Sair
      </button>
    </div>
  );
}
