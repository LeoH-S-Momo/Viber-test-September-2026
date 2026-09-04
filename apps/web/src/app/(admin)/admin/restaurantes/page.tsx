'use client';

import { useState } from 'react';
import { UtensilsCrossed } from 'lucide-react';
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
import { formatTime } from '@/lib/format';
import { getRestaurant, listRestaurants } from '@/services/admin.service';
import type { AdminRestaurantListItem } from '@/types/admin';

function RestaurantDetailModal({ restaurantId, onClose }: { restaurantId: string; onClose: () => void }) {
  const detail = useAdminDetail(getRestaurant, restaurantId);

  return (
    <Modal title="Detalhes do restaurante" onClose={onClose}>
      {detail === 'loading' && <Skeleton className="h-40 w-full rounded-xl" />}
      {detail === 'error' && <ErrorState message="Não foi possível carregar este restaurante." />}
      {detail !== 'loading' && detail !== 'error' && (
        <div className="flex flex-col gap-4 text-sm">
          <div>
            <p className="font-medium text-slate-900">{detail.name}</p>
            <p className="text-slate-500">{detail.ship.name}</p>
            {detail.description && <p className="mt-1 text-slate-600">{detail.description}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {detail.cuisineType && <Badge tone="brand">{detail.cuisineType}</Badge>}
            <Badge tone={detail.isIncluded ? 'success' : 'accent'}>{detail.isIncluded ? 'Incluso na tarifa' : 'Especialidade paga'}</Badge>
          </div>
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Horários</h4>
            {detail.diningSlots.length === 0 ? (
              <p className="text-slate-500">Nenhum horário cadastrado.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {detail.diningSlots.map((slot) => (
                  <li key={slot.id} className="flex justify-between rounded-lg border border-slate-200 px-3 py-2">
                    <span>{slot.label}</span>
                    <span className="text-slate-500">
                      {formatTime(slot.startTime)}–{formatTime(slot.endTime)} · {slot.capacity} lugares
                    </span>
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

export default function AdminRestaurantsPage() {
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { state, page, setPage, updateFilter } = useAdminList(listRestaurants, {} as { q?: string; shipId?: string });

  return (
    <>
      <SectionHeading
        eyebrow="Painel Admin"
        title="Restaurantes"
        icon={<UtensilsCrossed className="h-6 w-6 text-accent-600" aria-hidden="true" />}
        description="Todos os restaurantes cadastrados nos navios da plataforma."
      />

      <form
        className="mb-6 flex flex-wrap gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          updateFilter({ q: q || undefined });
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome…" className={`${filterInputClassName} w-64`} />
        <button type="submit" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Buscar
        </button>
      </form>

      {state.status === 'loading' && <Skeleton className="h-64 w-full rounded-2xl" />}
      {state.status === 'ready' && !state.result.ok && <ErrorState message={state.result.message} />}
      {state.status === 'ready' && state.result.ok && (
        <>
          {state.result.data.data.length === 0 ? (
            <EmptyState icon={<UtensilsCrossed className="h-6 w-6" aria-hidden="true" />} title="Nenhum restaurante encontrado" />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Nome</th>
                    <th className="px-4 py-3">Navio</th>
                    <th className="px-4 py-3">Culinária</th>
                    <th className="px-4 py-3">Horários</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {state.result.data.data.map((restaurant: AdminRestaurantListItem) => (
                    <tr key={restaurant.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3 font-medium text-slate-900">{restaurant.name}</td>
                      <td className="px-4 py-3">{restaurant.ship.name}</td>
                      <td className="px-4 py-3">{restaurant.cuisineType ?? '—'}</td>
                      <td className="px-4 py-3">{restaurant._count.diningSlots}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedId(restaurant.id)}
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

      {selectedId && <RestaurantDetailModal restaurantId={selectedId} onClose={() => setSelectedId(null)} />}
    </>
  );
}
