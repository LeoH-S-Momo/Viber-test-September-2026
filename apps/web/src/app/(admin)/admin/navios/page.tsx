'use client';

import { useState } from 'react';
import { Ship } from 'lucide-react';
import { SectionHeading } from '@/components/ui/section-heading';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Modal } from '@/components/ui/modal';
import { buttonVariants } from '@/components/ui/button-styles';
import { AdminPagination } from '@/features/admin/admin-pagination';
import { filterInputClassName } from '@/features/admin/admin-ui';
import { useAdminDetail } from '@/features/admin/use-admin-detail';
import { useAdminList } from '@/features/admin/use-admin-list';
import { getShip, listShips } from '@/services/admin.service';
import type { AdminShipListItem } from '@/types/admin';

function ShipDetailModal({ shipId, onClose }: { shipId: string; onClose: () => void }) {
  const detail = useAdminDetail(getShip, shipId);

  return (
    <Modal title="Detalhes do navio" onClose={onClose}>
      {detail === 'loading' && <Skeleton className="h-40 w-full rounded-xl" />}
      {detail === 'error' && <ErrorState message="Não foi possível carregar este navio." />}
      {detail !== 'loading' && detail !== 'error' && (
        <div className="flex flex-col gap-4 text-sm">
          <div>
            <p className="font-medium text-slate-900">{detail.name}</p>
            <p className="text-slate-500">{detail.organizer.name}</p>
            {detail.description && <p className="mt-1 text-slate-600">{detail.description}</p>}
          </div>
          <div className="flex flex-wrap gap-6 text-slate-600">
            <span>Capacidade: {detail.passengerCapacity}</span>
            {detail.imoNumber && <span>IMO: {detail.imoNumber}</span>}
            {detail.yearBuilt && <span>Ano: {detail.yearBuilt}</span>}
          </div>
          <div className="flex gap-6 text-slate-600">
            <span>{detail._count.cruises} cruzeiros</span>
            <span>{detail._count.venues} espaços</span>
            <span>{detail._count.restaurants} restaurantes</span>
          </div>
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Decks</h4>
            <ul className="flex flex-col gap-1">
              {detail.decks.map((deck) => (
                <li key={deck.id} className="flex justify-between rounded-lg border border-slate-200 px-3 py-2">
                  <span>
                    Deck {deck.number} — {deck.name}
                  </span>
                  <span className="text-slate-500">{deck._count.cabins} cabines</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function AdminShipsPage() {
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { state, page, setPage, updateFilter } = useAdminList(listShips, {} as { q?: string; organizerId?: string });

  return (
    <>
      <SectionHeading
        eyebrow="Painel Admin"
        title="Navios"
        icon={<Ship className="h-6 w-6 text-accent-600" aria-hidden="true" />}
        description="Todos os navios cadastrados na plataforma, de qualquer organizador."
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
            <EmptyState icon={<Ship className="h-6 w-6" aria-hidden="true" />} title="Nenhum navio encontrado" />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Nome</th>
                    <th className="px-4 py-3">Organizador</th>
                    <th className="px-4 py-3">Capacidade</th>
                    <th className="px-4 py-3">Cruzeiros</th>
                    <th className="px-4 py-3">Decks</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {state.result.data.data.map((ship: AdminShipListItem) => (
                    <tr key={ship.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3 font-medium text-slate-900">{ship.name}</td>
                      <td className="px-4 py-3">{ship.organizer.name}</td>
                      <td className="px-4 py-3">{ship.passengerCapacity}</td>
                      <td className="px-4 py-3">{ship._count.cruises}</td>
                      <td className="px-4 py-3">{ship._count.decks}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedId(ship.id)}
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

      {selectedId && <ShipDetailModal shipId={selectedId} onClose={() => setSelectedId(null)} />}
    </>
  );
}
