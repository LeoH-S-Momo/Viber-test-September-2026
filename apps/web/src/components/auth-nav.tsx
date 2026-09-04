'use client';

import Link from 'next/link';
import { CalendarCheck, LogIn, LogOut, ScanLine, Ticket as TicketIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

/** Ilha client-side no header (que e Server Component) — so aqui a sessao (memoria, ver AuthProvider) e lida. */
export function AuthNav() {
  const { user, isLoading, logout } = useAuth();

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

  const isStaff = user.roles.some((r) => r.key === 'ORGANIZER_STAFF' || r.key === 'ORGANIZER_ADMIN');

  return (
    <div className="flex items-center gap-1 sm:gap-2">
      {!isStaff && (
        <Link
          href="/reservas"
          className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-brand-50 hover:text-brand-800 sm:px-4"
        >
          <CalendarCheck className="h-4 w-4" aria-hidden="true" />
          Minha viagem
        </Link>
      )}
      <Link
        href={isStaff ? '/organizador/check-in' : '/ingressos'}
        className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-brand-50 hover:text-brand-800 sm:px-4"
      >
        {isStaff ? <ScanLine className="h-4 w-4" aria-hidden="true" /> : <TicketIcon className="h-4 w-4" aria-hidden="true" />}
        {isStaff ? 'Check-in' : 'Meus ingressos'}
      </Link>
      <button
        type="button"
        onClick={() => logout()}
        className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 sm:px-4"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        Sair
      </button>
    </div>
  );
}
