'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { UtensilsCrossed } from 'lucide-react';
import { SectionHeading } from '@/components/ui/section-heading';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button-styles';
import { RequireRole } from '@/components/require-role';
import { useAuth } from '@/lib/auth-context';
import { formatTime } from '@/lib/format';
import { createRestaurant, getMyRestaurants, getMyShips } from '@/services/organizers.service';
import type { OrganizerRestaurant, OrganizerShip } from '@/types/organizer';

const inputClassName =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500';
const labelClassName = 'mb-1.5 block text-sm font-medium text-slate-700';

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; restaurants: OrganizerRestaurant[] };

function NewRestaurantForm({ accessToken, ships, onCreated }: { accessToken: string; ships: OrganizerShip[]; onCreated: () => void }) {
  const [shipId, setShipId] = useState('');
  const [name, setName] = useState('');
  const [cuisineType, setCuisineType] = useState('');
  const [isIncluded, setIsIncluded] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!shipId) return;
    setSubmitting(true);
    setError(null);
    const result = await createRestaurant(accessToken, shipId, { name, cuisineType: cuisineType || undefined, isIncluded });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setName('');
    setCuisineType('');
    onCreated();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl border border-dashed border-slate-300 p-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="restaurant-ship" className={labelClassName}>
            Navio
          </label>
          <select id="restaurant-ship" required value={shipId} onChange={(e) => setShipId(e.target.value)} className={inputClassName}>
            <option value="">Selecione um navio</option>
            {ships.map((ship) => (
              <option key={ship.id} value={ship.id}>
                {ship.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="restaurant-name" className={labelClassName}>
            Nome
          </label>
          <input id="restaurant-name" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} className={inputClassName} />
        </div>
        <div>
          <label htmlFor="restaurant-cuisine" className={labelClassName}>
            Culinária (opcional)
          </label>
          <input id="restaurant-cuisine" value={cuisineType} onChange={(e) => setCuisineType(e.target.value)} className={inputClassName} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={isIncluded} onChange={(e) => setIsIncluded(e.target.checked)} />
        Incluso na tarifa (não é especialidade paga à parte)
      </label>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <button type="submit" disabled={submitting} className={buttonVariants({ variant: 'secondary', className: 'self-start' })}>
        {submitting ? 'Criando…' : 'Criar restaurante'}
      </button>
    </form>
  );
}

function RestaurantsContent() {
  const { accessToken } = useAuth();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [ships, setShips] = useState<OrganizerShip[]>([]);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const [restaurantsResult, shipsResult] = await Promise.all([getMyRestaurants(accessToken), getMyShips(accessToken)]);
    if (shipsResult.ok) setShips(shipsResult.data);
    setState(
      restaurantsResult.ok ? { status: 'ready', restaurants: restaurantsResult.data } : { status: 'error', message: restaurantsResult.message },
    );
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <SectionHeading
        eyebrow="Gastronomia"
        title="Restaurantes"
        icon={<UtensilsCrossed className="h-6 w-6 text-accent-600" aria-hidden="true" />}
        description="Restaurantes e seus horários de funcionamento, por navio."
      />

      {state.status === 'loading' && <Skeleton className="h-32 w-full rounded-2xl" />}
      {state.status === 'error' && <ErrorState message={state.message} />}

      {state.status === 'ready' && (
        <div className="flex flex-col gap-6">
          {state.restaurants.length === 0 ? (
            <EmptyState icon={<UtensilsCrossed className="h-6 w-6" aria-hidden="true" />} title="Nenhum restaurante cadastrado ainda" />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {state.restaurants.map((restaurant) => (
                <div key={restaurant.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">{restaurant.ship.name}</p>
                      <h3 className="font-display font-bold text-slate-900">{restaurant.name}</h3>
                    </div>
                    <Badge tone={restaurant.isIncluded ? 'success' : 'neutral'}>{restaurant.isIncluded ? 'Incluso' : 'Taxa adicional'}</Badge>
                  </div>
                  {restaurant.cuisineType && <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">{restaurant.cuisineType}</p>}
                  {restaurant.diningSlots.length > 0 && (
                    <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3">
                      {restaurant.diningSlots.map((slot) => (
                        <li key={slot.id} className="flex justify-between text-xs text-slate-600">
                          <span>{slot.label}</span>
                          <span>
                            {formatTime(slot.startTime)}–{formatTime(slot.endTime)} · {slot.capacity} lugares
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}

          {accessToken && <NewRestaurantForm accessToken={accessToken} ships={ships} onCreated={load} />}
        </div>
      )}
    </>
  );
}

export default function OrganizerRestaurantsPage() {
  return (
    <RequireRole roles={['ORGANIZER_ADMIN']}>
      <RestaurantsContent />
    </RequireRole>
  );
}
