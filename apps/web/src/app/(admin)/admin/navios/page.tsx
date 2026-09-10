'use client';

import { useEffect, useState } from 'react';
import { Plus, Ship, Trash2 } from 'lucide-react';
import { SectionHeading } from '@/components/ui/section-heading';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button-styles';
import { AdminPagination } from '@/features/admin/admin-pagination';
import { filterInputClassName } from '@/features/admin/admin-ui';
import { AddShipModal } from '@/features/admin/add-ship-modal';
import type { MockShipOption } from '@/features/admin/mock-ship-catalog';
import { useAdminDetail } from '@/features/admin/use-admin-detail';
import { useAdminList } from '@/features/admin/use-admin-list';
import { getShip, listShips } from '@/services/admin.service';
import type { AdminShipListItem } from '@/types/admin';

/** Só neste navegador — ver mock-ship-catalog.ts, esta seção não grava no banco de verdade. */
const MOCK_SHIPS_STORAGE_KEY = 'seapass-admin-mock-ships';

function loadMockShips(): MockShipOption[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(MOCK_SHIPS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as MockShipOption[]) : [];
  } catch {
    return [];
  }
}

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
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [mockShips, setMockShips] = useState<MockShipOption[]>([]);
  const { state, page, setPage, updateFilter } = useAdminList(listShips, {} as { q?: string; organizerId?: string });

  useEffect(() => {
    setMockShips(loadMockShips());
  }, []);

  function persistMockShips(next: MockShipOption[]) {
    setMockShips(next);
    try {
      window.localStorage.setItem(MOCK_SHIPS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // localStorage indisponível (modo privado etc.) — a lista ainda funciona nesta sessão,
      // só não sobrevive a um reload. Não é crítico pra uma feature de demonstração.
    }
  }

  function handleAddMockShip(ship: MockShipOption) {
    if (mockShips.some((existing) => existing.id === ship.id)) return;
    persistMockShips([ship, ...mockShips]);
  }

  function handleRemoveMockShip(shipId: string) {
    persistMockShips(mockShips.filter((ship) => ship.id !== shipId));
  }

  return (
    <>
      <SectionHeading
        eyebrow="Painel Admin"
        title="Navios"
        icon={<Ship className="h-6 w-6 text-accent-600" aria-hidden="true" />}
        description="Todos os navios cadastrados na plataforma, de qualquer organizador."
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <form
          className="flex flex-wrap gap-3"
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
        <button type="button" onClick={() => setIsAddModalOpen(true)} className={buttonVariants({ variant: 'primary', size: 'sm' })}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar navio
        </button>
      </div>

      {mockShips.length > 0 && (
        <div className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-slate-500">
              Navios adicionados nesta sessão
            </h3>
            <Badge tone="accent">Demonstração — não salvo no banco</Badge>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {mockShips.map((ship) => (
              <div key={ship.id} className="flex flex-col gap-2 rounded-2xl border border-dashed border-accent-300 bg-accent-50/40 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-900">{ship.name}</p>
                    <Badge tone="neutral">{ship.shipClass}</Badge>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveMockShip(ship.id)}
                    className="rounded-full p-1.5 text-slate-400 transition hover:bg-white hover:text-red-600"
                    aria-label={`Remover ${ship.name}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  Capacidade: {ship.passengerCapacity.toLocaleString('pt-BR')} · Ano: {ship.yearBuilt}
                </p>
                <p className="text-sm text-slate-600">{ship.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

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
      {isAddModalOpen && (
        <AddShipModal
          alreadyAddedIds={new Set(mockShips.map((ship) => ship.id))}
          onAdd={handleAddMockShip}
          onClose={() => setIsAddModalOpen(false)}
        />
      )}
    </>
  );
}
