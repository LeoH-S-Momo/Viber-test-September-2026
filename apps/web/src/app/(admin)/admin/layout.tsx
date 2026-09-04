import type { ReactNode } from 'react';
import { Container } from '@/components/ui/container';
import { AdminSidebar } from '@/features/admin/admin-sidebar';
import { RequireRole } from '@/components/require-role';

/** Casca do painel administrativo global — barra lateral com os 13 modulos + auditoria (ver ADR-0018), so PLATFORM_ADMIN. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <RequireRole roles={['PLATFORM_ADMIN']}>
      <Container className="flex flex-col gap-8 py-10 sm:flex-row sm:gap-10">
        <AdminSidebar />
        <div className="min-w-0 flex-1">{children}</div>
      </Container>
    </RequireRole>
  );
}
