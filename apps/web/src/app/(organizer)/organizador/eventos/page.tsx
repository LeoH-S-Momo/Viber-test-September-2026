'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Mic2 } from 'lucide-react';
import { SectionHeading } from '@/components/ui/section-heading';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button-styles';
import { RequireRole } from '@/components/require-role';
import { useAuth } from '@/lib/auth-context';
import { formatDayMonth, formatTime } from '@/lib/format';
import { createEvent, getArtists, getMyCruises, getMyEvents, getShipVenues } from '@/services/organizers.service';
import type { CruiseSummary } from '@/types/cruise';
import type { OrganizerEvent } from '@/types/organizer';

const inputClassName =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500';
const labelClassName = 'mb-1.5 block text-sm font-medium text-slate-700';

/** `Date` -> valor aceito por `<input type="datetime-local">`. */
function toDateTimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; events: OrganizerEvent[] };

function NewEventForm({
  accessToken,
  cruises,
  onCreated,
}: {
  accessToken: string;
  cruises: CruiseSummary[];
  onCreated: () => void;
}) {
  const [cruiseId, setCruiseId] = useState('');
  const [venues, setVenues] = useState<Array<{ id: string; name: string }>>([]);
  const [artists, setArtists] = useState<Array<{ id: string; name: string }>>([]);
  const [venueId, setVenueId] = useState('');
  const [artistId, setArtistId] = useState('');
  const [title, setTitle] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [capacity, setCapacity] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getArtists().then((result) => {
      if (result.ok) setArtists(result.data);
    });
  }, []);

  useEffect(() => {
    setVenueId('');
    setVenues([]);
    const cruise = cruises.find((c) => c.id === cruiseId);
    if (!cruise) return;
    getShipVenues(cruise.shipId).then((result) => {
      if (result.ok) setVenues(result.data);
    });
  }, [cruiseId, cruises]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!cruiseId || !venueId) return;
    setSubmitting(true);
    setError(null);
    const result = await createEvent(accessToken, {
      cruiseId,
      venueId,
      artistId: artistId || undefined,
      title,
      category: 'OTHER',
      isIncluded: true,
      startAt: new Date(startAt),
      endAt: new Date(endAt),
      capacity: capacity ? Number(capacity) : undefined,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setTitle('');
    setCapacity('');
    onCreated();
  }

  const minDateTime = toDateTimeLocal(new Date());

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl border border-dashed border-slate-300 p-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="event-cruise" className={labelClassName}>
            Cruzeiro
          </label>
          <select id="event-cruise" required value={cruiseId} onChange={(e) => setCruiseId(e.target.value)} className={inputClassName}>
            <option value="">Selecione um cruzeiro</option>
            {cruises.map((cruise) => (
              <option key={cruise.id} value={cruise.id}>
                {cruise.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="event-venue" className={labelClassName}>
            Espaço (venue)
          </label>
          <select id="event-venue" required disabled={!cruiseId} value={venueId} onChange={(e) => setVenueId(e.target.value)} className={inputClassName}>
            <option value="">{cruiseId ? 'Selecione um espaço' : 'Selecione um cruzeiro primeiro'}</option>
            {venues.map((venue) => (
              <option key={venue.id} value={venue.id}>
                {venue.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="event-title" className={labelClassName}>
            Título do evento
          </label>
          <input id="event-title" required minLength={2} value={title} onChange={(e) => setTitle(e.target.value)} className={inputClassName} />
        </div>
        <div>
          <label htmlFor="event-artist" className={labelClassName}>
            Artista (opcional)
          </label>
          <select id="event-artist" value={artistId} onChange={(e) => setArtistId(e.target.value)} className={inputClassName}>
            <option value="">Sem artista definido</option>
            {artists.map((artist) => (
              <option key={artist.id} value={artist.id}>
                {artist.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="event-start" className={labelClassName}>
            Início
          </label>
          <input id="event-start" type="datetime-local" required min={minDateTime} value={startAt} onChange={(e) => setStartAt(e.target.value)} className={inputClassName} />
        </div>
        <div>
          <label htmlFor="event-end" className={labelClassName}>
            Fim
          </label>
          <input id="event-end" type="datetime-local" required min={startAt || minDateTime} value={endAt} onChange={(e) => setEndAt(e.target.value)} className={inputClassName} />
        </div>
        <div>
          <label htmlFor="event-capacity" className={labelClassName}>
            Capacidade (opcional)
          </label>
          <input id="event-capacity" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} className={inputClassName} />
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <button type="submit" disabled={submitting} className={buttonVariants({ variant: 'secondary', className: 'self-start' })}>
        {submitting ? 'Criando…' : 'Criar evento'}
      </button>
    </form>
  );
}

function EventsContent() {
  const { accessToken } = useAuth();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [cruises, setCruises] = useState<CruiseSummary[]>([]);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const [eventsResult, cruisesResult] = await Promise.all([getMyEvents(accessToken), getMyCruises(accessToken)]);
    if (cruisesResult.ok) setCruises(cruisesResult.data.data);
    setState(eventsResult.ok ? { status: 'ready', events: eventsResult.data } : { status: 'error', message: eventsResult.message });
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <SectionHeading
        eyebrow="Programação"
        title="Eventos"
        icon={<Mic2 className="h-6 w-6 text-accent-600" aria-hidden="true" />}
        description="Shows e atrações programadas nos seus cruzeiros."
      />

      {state.status === 'loading' && <Skeleton className="h-32 w-full rounded-2xl" />}
      {state.status === 'error' && <ErrorState message={state.message} />}

      {state.status === 'ready' && (
        <div className="flex flex-col gap-6">
          {state.events.length === 0 ? (
            <EmptyState icon={<Mic2 className="h-6 w-6" aria-hidden="true" />} title="Nenhum evento cadastrado ainda" />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {state.events.map((event) => (
                <div key={event.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <Badge tone="neutral">{event.cruise.title}</Badge>
                  </div>
                  <h3 className="font-display font-bold text-slate-900">{event.title}</h3>
                  {event.artist && <p className="text-sm font-medium text-brand-700">com {event.artist.name}</p>}
                  <p className="mt-1 text-sm text-slate-600">
                    {formatDayMonth(event.startAt)} · {formatTime(event.startAt)}–{formatTime(event.endAt)} · {event.venue.name}
                  </p>
                  {event.capacity && <p className="mt-1 text-xs text-slate-500">Capacidade: {event.capacity}</p>}
                </div>
              ))}
            </div>
          )}

          {accessToken && <NewEventForm accessToken={accessToken} cruises={cruises} onCreated={load} />}
        </div>
      )}
    </>
  );
}

export default function OrganizerEventsPage() {
  return (
    <RequireRole roles={['ORGANIZER_ADMIN']}>
      <EventsContent />
    </RequireRole>
  );
}
