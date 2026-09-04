'use client';

import { useState } from 'react';
import { ScanLine } from 'lucide-react';
import { SectionHeading } from '@/components/ui/section-heading';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { buttonVariants } from '@/components/ui/button-styles';
import { AdminPagination } from '@/features/admin/admin-pagination';
import { filterInputClassName } from '@/features/admin/admin-ui';
import { useAdminList } from '@/features/admin/use-admin-list';
import { formatDateTime } from '@/lib/format';
import { listCheckIns } from '@/services/admin.service';
import type { AdminCheckInListItem } from '@/types/admin';

export default function AdminCheckInsPage() {
  const [q, setQ] = useState('');
  const { state, page, setPage, filters, updateFilter } = useAdminList(listCheckIns, {} as { q?: string; from?: string; to?: string });

  return (
    <>
      <SectionHeading
        eyebrow="Painel Admin"
        title="Check-ins"
        icon={<ScanLine className="h-6 w-6 text-accent-600" aria-hidden="true" />}
        description="Todos os check-ins de embarque realizados pela equipe dos organizadores."
      />

      <form
        className="mb-6 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          updateFilter({ q: q || undefined });
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por código do ticket…"
          className={`${filterInputClassName} w-64`}
        />
        <button type="submit" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Buscar
        </button>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          De
          <input
            type="date"
            value={filters.from?.slice(0, 10) ?? ''}
            onChange={(e) => updateFilter({ from: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
            className={filterInputClassName}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Até
          <input
            type="date"
            value={filters.to?.slice(0, 10) ?? ''}
            onChange={(e) => updateFilter({ to: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
            className={filterInputClassName}
          />
        </label>
      </form>

      {state.status === 'loading' && <Skeleton className="h-64 w-full rounded-2xl" />}
      {state.status === 'ready' && !state.result.ok && <ErrorState message={state.result.message} />}
      {state.status === 'ready' && state.result.ok && (
        <>
          {state.result.data.data.length === 0 ? (
            <EmptyState icon={<ScanLine className="h-6 w-6" aria-hidden="true" />} title="Nenhum check-in encontrado" />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Hóspede</th>
                    <th className="px-4 py-3">Código do ticket</th>
                    <th className="px-4 py-3">Feito por</th>
                    <th className="px-4 py-3">Local</th>
                    <th className="px-4 py-3">Data/hora</th>
                  </tr>
                </thead>
                <tbody>
                  {state.result.data.data.map((checkIn: AdminCheckInListItem) => (
                    <tr key={checkIn.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3 font-medium text-slate-900">{checkIn.ticket.bookingGuest.fullName}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{checkIn.ticket.qrCode}</td>
                      <td className="px-4 py-3">
                        <p>{checkIn.staffUser.fullName}</p>
                        <p className="text-xs text-slate-500">{checkIn.staffUser.email}</p>
                      </td>
                      <td className="px-4 py-3">{checkIn.location ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-500">{formatDateTime(checkIn.checkedInAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <AdminPagination meta={state.result.data.meta} page={page} setPage={setPage} />
        </>
      )}
    </>
  );
}
