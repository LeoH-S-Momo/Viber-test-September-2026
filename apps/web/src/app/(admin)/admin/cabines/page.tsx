'use client';

import { useState } from 'react';
import { DoorClosed } from 'lucide-react';
import { SectionHeading } from '@/components/ui/section-heading';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { buttonVariants } from '@/components/ui/button-styles';
import { AdminPagination } from '@/features/admin/admin-pagination';
import { filterInputClassName } from '@/features/admin/admin-ui';
import { useAdminDetail } from '@/features/admin/use-admin-detail';
import { useAdminList } from '@/features/admin/use-admin-list';
import { formatDate } from '@/lib/format';
import { getCabin, listCabins } from '@/services/admin.service';
import type { AdminCabinListItem, AdminCabinStatus } from '@/types/admin';

const STATUS_TONE: Record<AdminCabinStatus, 'success' | 'neutral' | 'accent'> = {
  ACTIVE: 'success',
  MAINTENANCE: 'accent',
  RETIRED: 'neutral',
};

const STATUS_LABEL: Record<AdminCabinStatus, string> = {
  ACTIVE: 'Ativa',
  MAINTENANCE: 'Manutenção',
  RETIRED: 'Desativada',
};

function CabinDetailModal({ cabinId, onClose }: { cabinId: string; onClose: () => void }) {
  const detail = useAdminDetail(getCabin, cabinId);

  return (
    <Modal title="Detalhes da cabine" onClose={onClose}>
      {detail === 'loading' && <Skeleton className="h-40 w-full rounded-xl" />}
      {detail === 'error' && <ErrorState message="Não foi possível carregar esta cabine." />}
      {detail !== 'loading' && detail !== 'error' && (
        <div className="flex flex-col gap-4 text-sm">
          <div>
            <p className="font-medium text-slate-900">Cabine {detail.code}</p>
            <p className="text-slate-500">
              {detail.deck.ship.name} · {detail.deck.name}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[detail.status]}>{STATUS_LABEL[detail.status]}</Badge>
            <Badge tone="brand">
              {detail.cabinCategory.name} · até {detail.cabinCategory.maxOccupancy} hóspedes
            </Badge>
          </div>
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Últimas reservas</h4>
            {detail.bookings.length === 0 ? (
              <p className="text-slate-500">Nenhuma reserva.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {detail.bookings.map((b) => (
                  <li key={b.id} className="rounded-lg border border-slate-200 px-3 py-2">
                    <p className="font-medium text-slate-900">{b.cruise.title}</p>
                    <p className="text-xs text-slate-500">
                      {b.status} · {formatDate(b.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function AdminCabinsPage() {
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { state, page, setPage, filters, updateFilter } = useAdminList(listCabins, {} as { q?: string; shipId?: string; status?: string });

  return (
    <>
      <SectionHeading
        eyebrow="Painel Admin"
        title="Cabines"
        icon={<DoorClosed className="h-6 w-6 text-accent-600" aria-hidden="true" />}
        description="Todas as cabines cadastradas, de qualquer navio."
      />

      <form
        className="mb-6 flex flex-wrap gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          updateFilter({ q: q || undefined });
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por código…" className={`${filterInputClassName} w-64`} />
        <button type="submit" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Buscar
        </button>
        <select
          value={filters.status ?? ''}
          onChange={(e) => updateFilter({ status: e.target.value || undefined })}
          className={filterInputClassName}
        >
          <option value="">Todos os status</option>
          <option value="ACTIVE">Ativa</option>
          <option value="MAINTENANCE">Manutenção</option>
          <option value="RETIRED">Desativada</option>
        </select>
      </form>

      {state.status === 'loading' && <Skeleton className="h-64 w-full rounded-2xl" />}
      {state.status === 'ready' && !state.result.ok && <ErrorState message={state.result.message} />}
      {state.status === 'ready' && state.result.ok && (
        <>
          {state.result.data.data.length === 0 ? (
            <EmptyState icon={<DoorClosed className="h-6 w-6" aria-hidden="true" />} title="Nenhuma cabine encontrada" />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Código</th>
                    <th className="px-4 py-3">Navio</th>
                    <th className="px-4 py-3">Categoria</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {state.result.data.data.map((cabin: AdminCabinListItem) => (
                    <tr key={cabin.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3 font-medium text-slate-900">{cabin.code}</td>
                      <td className="px-4 py-3">
                        {cabin.deck.ship.name} <span className="text-xs text-slate-500">({cabin.deck.name})</span>
                      </td>
                      <td className="px-4 py-3">{cabin.cabinCategory.name}</td>
                      <td className="px-4 py-3">
                        <Badge tone={STATUS_TONE[cabin.status]}>{STATUS_LABEL[cabin.status]}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedId(cabin.id)}
                          className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                        >
                          Detalhes
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <AdminPagination meta={state.result.data.meta} page={page} setPage={setPage} />
        </>
      )}

      {selectedId && <CabinDetailModal cabinId={selectedId} onClose={() => setSelectedId(null)} />}
    </>
  );
}
