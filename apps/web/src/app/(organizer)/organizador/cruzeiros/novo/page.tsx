'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarRange } from 'lucide-react';
import { SectionHeading } from '@/components/ui/section-heading';
import { buttonVariants } from '@/components/ui/button-styles';
import { RequireRole } from '@/components/require-role';
import { useAuth } from '@/lib/auth-context';
import { createCruise, getMyShips, getPorts } from '@/services/organizers.service';
import type { Port } from '@/types/cruise';
import type { OrganizerShip } from '@/types/organizer';

const inputClassName =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500';
const labelClassName = 'mb-1.5 block text-sm font-medium text-slate-700';

/** `Date` -> valor aceito por `<input type="datetime-local">`. */
function toDateTimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function NewCruiseForm() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const [ships, setShips] = useState<OrganizerShip[]>([]);
  const [ports, setPorts] = useState<Port[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [shipId, setShipId] = useState('');
  const [title, setTitle] = useState('');
  const [theme, setTheme] = useState('');
  const [description, setDescription] = useState('');
  const [embarkationDate, setEmbarkationDate] = useState('');
  const [disembarkationDate, setDisembarkationDate] = useState('');
  const [embarkationPortId, setEmbarkationPortId] = useState('');
  const [disembarkationPortId, setDisembarkationPortId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    (async () => {
      const [shipsResult, portsResult] = await Promise.all([getMyShips(accessToken), getPorts()]);
      if (cancelled) return;
      if (shipsResult.ok) setShips(shipsResult.data);
      if (portsResult.ok) {
        const list = Array.isArray(portsResult.data) ? portsResult.data : portsResult.data.data;
        setPorts(list);
      }
      if (!shipsResult.ok || !portsResult.ok) {
        setLoadError('Não foi possível carregar navios/portos.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!accessToken) return;
    setSubmitting(true);
    setError(null);
    const result = await createCruise(accessToken, {
      shipId,
      title,
      theme,
      description: description || undefined,
      embarkationDate: new Date(embarkationDate),
      disembarkationDate: new Date(disembarkationDate),
      embarkationPortId,
      disembarkationPortId,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.push(`/organizador/cruzeiros/${result.data.id}`);
  }

  const minDateTime = toDateTimeLocal(new Date());

  return (
    <>
      <SectionHeading
        eyebrow="Novo"
        title="Criar cruzeiro"
        icon={<CalendarRange className="h-6 w-6 text-accent-600" aria-hidden="true" />}
        description="O cruzeiro nasce como rascunho — defina o preço por categoria de cabine e publique quando estiver pronto."
      />

      {loadError && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex max-w-2xl flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <label htmlFor="ship" className={labelClassName}>
            Navio
          </label>
          <select id="ship" required value={shipId} onChange={(e) => setShipId(e.target.value)} className={inputClassName}>
            <option value="">Selecione um navio</option>
            {ships.map((ship) => (
              <option key={ship.id} value={ship.id}>
                {ship.name}
              </option>
            ))}
          </select>
          {ships.length === 0 && (
            <p className="mt-1 text-xs text-slate-500">
              Nenhum navio cadastrado ainda —{' '}
              <a href="/organizador/navios" className="underline">
                cadastre um navio
              </a>{' '}
              primeiro.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="title" className={labelClassName}>
              Título
            </label>
            <input id="title" required minLength={3} value={title} onChange={(e) => setTitle(e.target.value)} className={inputClassName} />
          </div>
          <div>
            <label htmlFor="theme" className={labelClassName}>
              Tema
            </label>
            <input id="theme" required minLength={2} value={theme} onChange={(e) => setTheme(e.target.value)} className={inputClassName} />
          </div>
        </div>

        <div>
          <label htmlFor="description" className={labelClassName}>
            Descrição (opcional)
          </label>
          <textarea
            id="description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClassName}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="embark-date" className={labelClassName}>
              Data/hora de embarque
            </label>
            <input
              id="embark-date"
              type="datetime-local"
              required
              min={minDateTime}
              value={embarkationDate}
              onChange={(e) => setEmbarkationDate(e.target.value)}
              className={inputClassName}
            />
          </div>
          <div>
            <label htmlFor="disembark-date" className={labelClassName}>
              Data/hora de desembarque
            </label>
            <input
              id="disembark-date"
              type="datetime-local"
              required
              min={embarkationDate || minDateTime}
              value={disembarkationDate}
              onChange={(e) => setDisembarkationDate(e.target.value)}
              className={inputClassName}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="embark-port" className={labelClassName}>
              Porto de embarque
            </label>
            <select
              id="embark-port"
              required
              value={embarkationPortId}
              onChange={(e) => setEmbarkationPortId(e.target.value)}
              className={inputClassName}
            >
              <option value="">Selecione um porto</option>
              {ports.map((port) => (
                <option key={port.id} value={port.id}>
                  {port.name} ({port.country})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="disembark-port" className={labelClassName}>
              Porto de desembarque
            </label>
            <select
              id="disembark-port"
              required
              value={disembarkationPortId}
              onChange={(e) => setDisembarkationPortId(e.target.value)}
              className={inputClassName}
            >
              <option value="">Selecione um porto</option>
              {ports.map((port) => (
                <option key={port.id} value={port.id}>
                  {port.name} ({port.country})
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting} className={buttonVariants({ variant: 'primary', className: 'mt-2 self-start' })}>
          {submitting ? 'Criando…' : 'Criar cruzeiro'}
        </button>
      </form>
    </>
  );
}

export default function NewCruisePage() {
  return (
    <RequireRole roles={['ORGANIZER_ADMIN']}>
      <NewCruiseForm />
    </RequireRole>
  );
}
