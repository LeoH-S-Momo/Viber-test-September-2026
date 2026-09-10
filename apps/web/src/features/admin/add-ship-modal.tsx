'use client';

import { useMemo, useState } from 'react';
import { Ship as ShipIcon, Plus } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button-styles';
import { filterInputClassName } from '@/features/admin/admin-ui';
import { MOCK_SHIP_CATALOG, type MockShipOption } from './mock-ship-catalog';

/** Modal de escolha do catálogo mockado — ver mock-ship-catalog.ts pro porquê disto ser
 * totalmente client-side (sem endpoint de admin pra criar navio em nome de outro organizador). */
export function AddShipModal({
  onAdd,
  onClose,
  alreadyAddedIds,
}: {
  onAdd: (ship: MockShipOption) => void;
  onClose: () => void;
  alreadyAddedIds: Set<string>;
}) {
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return MOCK_SHIP_CATALOG;
    return MOCK_SHIP_CATALOG.filter(
      (ship) => ship.name.toLowerCase().includes(term) || ship.shipClass.toLowerCase().includes(term),
    );
  }, [q]);

  return (
    <Modal title="Adicionar navio" onClose={onClose}>
      <p className="mb-4 text-sm text-slate-600">
        Escolha um navio do catálogo de demonstração ({MOCK_SHIP_CATALOG.length} opções). Esta
        seção é totalmente mockada — os navios adicionados aqui ficam salvos só neste navegador,
        sem gravar no banco de dados real.
      </p>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por nome ou classe (Luxo, Família, Expedição…)"
        className={`${filterInputClassName} mb-4 w-full`}
      />
      <ul className="flex flex-col gap-2">
        {filtered.map((ship) => {
          const alreadyAdded = alreadyAddedIds.has(ship.id);
          return (
            <li
              key={ship.id}
              className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-slate-900">{ship.name}</p>
                  <Badge tone="neutral">{ship.shipClass}</Badge>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Capacidade: {ship.passengerCapacity.toLocaleString('pt-BR')} passageiros · Ano: {ship.yearBuilt}
                </p>
                <p className="mt-1 text-sm text-slate-600">{ship.description}</p>
              </div>
              <button
                type="button"
                disabled={alreadyAdded}
                onClick={() => onAdd(ship)}
                className={buttonVariants({ variant: alreadyAdded ? 'outline' : 'primary', size: 'sm', className: 'shrink-0' })}
              >
                {alreadyAdded ? (
                  'Adicionado'
                ) : (
                  <>
                    <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar
                  </>
                )}
              </button>
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li className="flex flex-col items-center gap-2 py-8 text-center text-sm text-slate-500">
            <ShipIcon className="h-6 w-6 text-slate-400" aria-hidden="true" />
            Nenhum navio do catálogo bate com essa busca.
          </li>
        )}
      </ul>
    </Modal>
  );
}
