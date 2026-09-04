'use client';

import { useState } from 'react';
import { CalendarRange } from 'lucide-react';
import { SectionHeading } from '@/components/ui/section-heading';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { buttonVariants } from '@/components/ui/button-styles';
import { AdminPagination } from '@/features/admin/admin-pagination';
import { AdminActionButton } from '@/features/admin/admin-action-button';
import { filterInputClassName } from '@/features/admin/admin-ui';
import { useAdminDetail } from '@/features/admin/use-admin-detail';
import { useAdminList } from '@/features/admin/use-admin-list';
import { formatDate, formatPrice } from '@/lib/format';
import { cancelCruise, getCruise, listCruises } from '@/services/admin.service';
import type { AdminCruiseListItem, AdminCruiseStatus } from '@/types/admin';

const STATUS_TONE: Record<AdminCruiseStatus, 'success' | 'neutral' | 'accent'> = {
  PUBLISHED: 'success',
  DRAFT: 'accent',
  CANCELLED: 'neutral',
  COMPLETED: 'neutral',
};

const STATUS_LABEL: Record<AdminCruiseStatus, string> = {
  PUBLISHED: 'Publicado',
  DRAFT: 'Rascunho',
  CANCELLED: 'Cancelado',
  COMPLETED: 'Concluído',
};

function CruiseDetailModal({ cruiseId, onClose, onChanged }: { cruiseId: string; onClose: () => void; onChanged: () => void }) {
  const detail = useAdminDetail(getCruise, cruiseId);

  return (
    <Modal title="Detalhes do cruzeiro" onClose={onClose}>
      {detail === 'loading' && <Skeleton className="h-40 w-full rounded-xl" />}
      {detail === 'error' && <ErrorState message="Não foi possível carregar este cruzeiro." />}
      {detail !== 'loading' && detail !== 'error' && (
        <div className="flex flex-col gap-4 text-sm">
          <div>
            <p className="font-medium text-slate-900">{detail.title}</p>
            <p className="text-slate-500">
              {detail.ship.name} · {detail.organizer.name}
            </p>
          </div>
          <Badge tone={STATUS_TONE[detail.status]}>{STATUS_LABEL[detail.status]}</Badge>
          <p className="text-slate-600">
            {formatDate(detail.embarkationDate)} → {formatDate(detail.disembarkationDate)}
          </p>
          <p className="text-slate-600">
            Embarque: {detail.embarkationPort.name}, {detail.embarkationPort.country} · Desembarque: {detail.disembarkationPort.name}, {detail.disembarkationPort.country}
          </p>
          <div className="flex gap-6 text-slate-600">
            <span>{detail._count.bookings} reservas</span>
            <span>{detail._count.events} eventos</span>
            <span>{detail._count.experiences} experiências</span>
          </div>
          {detail.cabinPricings.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Preços por categoria</h4>
              <ul className="flex flex-col gap-1">
                {detail.cabinPricings.map((p) => (
                  <li key={p.id} className="flex justify-between rounded-lg border border-slate-200 px-3 py-2">
                    <span>{p.cabinCategory.name}</span>
                    <span className="font-medium text-slate-900">{formatPrice(p.price)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {detail.status !== 'CANCELLED' && (
            <div className="flex justify-end border-t border-slate-200 pt-4">
              <AdminActionButton
                label="Cancelar cruzeiro"
                danger
                promptMessage="Motivo do cancelamento (opcional):"
                action={(token, reason) => cancelCruise(token, cruiseId, reason)}
                onDone={() => {
                  onChanged();
                  onClose();
                }}
              />
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function AdminCruisesPage() {
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { state, page, setPage, filters, updateFilter, reload } = useAdminList(listCruises, {} as { q?: string; status?: string });

  return (
    <>
      <SectionHeading
        eyebrow="Painel Admin"
        title="Cruzeiros"
        icon={<CalendarRange className="h-6 w-6 text-accent-600" aria-hidden="true" />}
        description="Todos os cruzeiros cadastrados na plataforma, de qualquer organizador."
      />

      <form
        className="mb-6 flex flex-wrap gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          updateFilter({ q: q || undefined });
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por título…" className={`${filterInputClassName} w-64`} />
        <button type="submit" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Buscar
        </button>
        <select
          value={filters.status ?? ''}
          onChange={(e) => updateFilter({ status: e.target.value || undefined })}
          className={filterInputClassName}
        >
          <option value="">Todos os status</option>
          <option value="DRAFT">Rascunho</option>
          <option value="PUBLISHED">Publicado</option>
          <option value="CANCELLED">Cancelado</option>
          <option value="COMPLETED">Concluído</option>
        </select>
      </form>

      {state.status === 'loading' && <Skeleton className="h-64 w-full rounded-2xl" />}
      {state.status === 'ready' && !state.result.ok && <ErrorState message={state.result.message} onRetry={reload} />}
      {state.status === 'ready' && state.result.ok && (
        <>
          {state.result.data.data.length === 0 ? (
            <EmptyState icon={<CalendarRange className="h-6 w-6" aria-hidden="true" />} title="Nenhum cruzeiro encontrado" />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Título</th>
                    <th className="px-4 py-3">Organizador</th>
                    <th className="px-4 py-3">Navio</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Embarque</th>
                    <th className="px-4 py-3">Reservas</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {state.result.data.data.map((cruise: AdminCruiseListItem) => (
                    <tr key={cruise.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3 font-medium text-slate-900">{cruise.title}</td>
                      <td className="px-4 py-3">{cruise.organizer.name}</td>
                      <td className="px-4 py-3">{cruise.ship.name}</td>
                      <td className="px-4 py-3">
                        <Badge tone={STATUS_TONE[cruise.status]}>{STATUS_LABEL[cruise.status]}</Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(cruise.embarkationDate)}</td>
                      <td className="px-4 py-3">{cruise._count.bookings}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedId(cruise.id)}
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

      {selectedId && <CruiseDetailModal cruiseId={selectedId} onClose={() => setSelectedId(null)} onChanged={reload} />}
    </>
  );
}
