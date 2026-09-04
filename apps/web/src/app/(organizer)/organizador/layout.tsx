'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Container } from '@/components/ui/container';
import { OrganizerSidebar } from '@/features/organizer/organizer-sidebar';
import { useAuth } from '@/lib/auth-context';

/**
 * Casca do painel do organizador — barra lateral com as 9 areas de gestao
 * (ver ADR-0016), so pra ORGANIZER_ADMIN (Staff continua so com check-in,
 * que mantem seu proprio layout de tela cheia sem a barra lateral). Cada
 * pagina ainda se protege com `<RequireRole>` — este layout so decide se
 * mostra o "chrome" ao redor, nunca substitui a checagem de acesso.
 */
export default function OrganizerLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const isAdmin = user?.roles.some((role) => role.key === 'ORGANIZER_ADMIN') ?? false;

  if (!isAdmin || pathname === '/organizador/check-in') {
    return <>{children}</>;
  }

  return (
    <Container className="flex flex-col gap-8 py-10 sm:flex-row sm:gap-10">
      <OrganizerSidebar />
      <div className="min-w-0 flex-1">{children}</div>
    </Container>
  );
}
