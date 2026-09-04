'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Ship as ShipIcon } from 'lucide-react';
import { SectionHeading } from '@/components/ui/section-heading';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { buttonVariants } from '@/components/ui/button-styles';
import { RequireRole } from '@/components/require-role';
import { useAuth } from '@/lib/auth-context';
import { createShip, getMyShips } from '@/services/organizers.service';
import type { OrganizerShip } from '@/types/organizer';

const inputClassName =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500';
const labelClassName = 'mb-1.5 block text-sm font-medium text-slate-700';

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; ships: OrganizerShip[] };

function NewShipForm({ accessToken, onCreated }: { accessToken: string; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [passengerCapacity, setPassengerCapacity] = useState('');
  const [yearBuilt, setYearBuilt] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await createShip(accessToken, {
      name,
      passengerCapacity: Number(passengerCapacity),
      yearBuilt: yearBuilt ? Number(yearBuilt) : undefined,
      description: description || undefined,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setName('');
    setPassengerCapacity('');
    setYearBuilt('');
    setDescription('');
    onCreated();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl border border-dashed border-slate-300 p-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="sm:col-span-1">
          <label htmlFor="ship-name" className={labelClassName}>
            Nome do navio
          </label>
          <input id="ship-name" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} className={inputClassName} />
        </div>
        <div>
          <label htmlFor="ship-capacity" className={labelClassName}>
            Capacidade de passageiros
          </label>
          <input
            id="ship-capacity"
            type="number"
            required
            min={1}
            value={passengerCapacity}
            onChange={(e) => setPassengerCapacity(e.target.value)}
            className={inputClassName}
          />
        </div>
        <div>
          <label htmlFor="ship-year" className={labelClassName}>
            Ano de construção (opcional)
          </label>
          <input
            id="ship-year"
            type="number"
            min={1900}
            max={2100}
            value={yearBuilt}
            onChange={(e) => setYearBuilt(e.target.value)}
            className={inputClassName}
          />
        </div>
      </div>
      <div>
        <label htmlFor="ship-description" className={labelClassName}>
          Descrição (opcional)
        </label>
        <textarea id="ship-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className={inputClassName} />
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <button type="submit" disabled={submitting} className={buttonVariants({ variant: 'secondary', className: 'self-start' })}>
        {submitting ? 'Criando…' : 'Cadastrar navio'}
      </button>
    </form>
  );
}

function ShipsContent() {
  const { accessToken } = useAuth();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  const load = useCallback(async () => {
    if (!accessToken) return;
    const result = await getMyShips(accessToken);
    setState(result.ok ? { status: 'ready', ships: result.data } : { status: 'error', message: result.message });
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <SectionHeading
        eyebrow="Frota"
        title="Navios"
        icon={<ShipIcon className="h-6 w-6 text-accent-600" aria-hidden="true" />}
        description="Cadastre os navios que operam seus cruzeiros — cabines, decks e espaços vivem dentro de cada navio."
      />

      {state.status === 'loading' && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-20 w-full rounded-2xl" />
        </div>
      )}

      {state.status === 'error' && <ErrorState message={state.message} />}

      {state.status === 'ready' && (
        <div className="flex flex-col gap-6">
          {state.ships.length === 0 ? (
            <EmptyState icon={<ShipIcon className="h-6 w-6" aria-hidden="true" />} title="Nenhum navio cadastrado ainda" />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {state.ships.map((ship) => (
                <div key={ship.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="font-display font-bold text-slate-900">{ship.name}</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Capacidade: {ship.passengerCapacity} passageiros{ship.yearBuilt ? ` · Construído em ${ship.yearBuilt}` : ''}
                  </p>
                  {ship.description && <p className="mt-2 text-sm text-slate-600">{ship.description}</p>}
                </div>
              ))}
            </div>
          )}

          {accessToken && <NewShipForm accessToken={accessToken} onCreated={load} />}
        </div>
      )}
    </>
  );
}

export default function OrganizerShipsPage() {
  return (
    <RequireRole roles={['ORGANIZER_ADMIN']}>
      <ShipsContent />
    </RequireRole>
  );
}
