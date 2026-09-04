'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CalendarCheck, Mic2, Ship, UtensilsCrossed, X } from 'lucide-react';
import { Container } from '@/components/ui/container';
import { SectionHeading } from '@/components/ui/section-heading';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button-styles';
import { RequireRole } from '@/components/require-role';
import { useAuth } from '@/lib/auth-context';
import { formatDate, formatDayMonth, formatTime } from '@/lib/format';
import { getMyBookings } from '@/services/bookings.service';
import { getCruiseBySlug } from '@/services/cruises.service';
import { cancelDiningReservation, cancelEventReservation, reserveDining, reserveEvent } from '@/services/activities.service';
import type { MyBooking } from '@/types/booking';
import type { CruiseDetail } from '@/types/cruise';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty' }
  | { status: 'ready'; booking: MyBooking };

/** `Date` -> "YYYY-MM-DD", pro `min`/`max`/`value` de um `<input type="date">`. */
function toDateInputValue(value: string | Date): string {
  return new Date(value).toISOString().slice(0, 10);
}

const inputClassName =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500';

function CancelButton({ onCancel, busy }: { onCancel: () => void; busy: boolean }) {
  return (
    <button
      type="button"
      onClick={onCancel}
      disabled={busy}
      className="flex shrink-0 items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
    >
      <X className="h-3.5 w-3.5" aria-hidden="true" />
      {busy ? 'Cancelando…' : 'Cancelar'}
    </button>
  );
}

function AddEventForm({
  bookingId,
  maxPartySize,
  events,
  accessToken,
  onReserved,
}: {
  bookingId: string;
  maxPartySize: number;
  events: CruiseDetail['events'];
  accessToken: string;
  onReserved: () => void;
}) {
  const [eventId, setEventId] = useState('');
  const [partySize, setPartySize] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (events.length === 0) return null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!eventId) return;
    setSubmitting(true);
    setError(null);
    const result = await reserveEvent(accessToken, bookingId, eventId, { partySize });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setEventId('');
    setPartySize(1);
    onReserved();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-2xl border border-dashed border-slate-300 p-4 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label htmlFor="event-select" className="mb-1.5 block text-sm font-medium text-slate-700">
          Adicionar evento
        </label>
        <select id="event-select" value={eventId} onChange={(e) => setEventId(e.target.value)} className={inputClassName}>
          <option value="">Selecione um evento</option>
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.title} — {formatDayMonth(event.startAt)} {formatTime(event.startAt)}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:w-32">
        <label htmlFor="event-party-size" className="mb-1.5 block text-sm font-medium text-slate-700">
          Pessoas
        </label>
        <input
          id="event-party-size"
          type="number"
          min={1}
          max={maxPartySize}
          value={partySize}
          onChange={(e) => setPartySize(Number(e.target.value))}
          className={inputClassName}
        />
      </div>
      <button type="submit" disabled={submitting || !eventId} className={buttonVariants({ variant: 'secondary' })}>
        {submitting ? 'Reservando…' : 'Reservar'}
      </button>
      {error && (
        <p role="alert" className="w-full rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}

function AddDiningForm({
  bookingId,
  maxPartySize,
  restaurants,
  minDate,
  maxDate,
  accessToken,
  onReserved,
}: {
  bookingId: string;
  maxPartySize: number;
  restaurants: CruiseDetail['ship']['restaurants'];
  minDate: string;
  maxDate: string;
  accessToken: string;
  onReserved: () => void;
}) {
  const slots = restaurants.flatMap((restaurant) => restaurant.diningSlots.map((slot) => ({ restaurant, slot })));
  const [diningSlotId, setDiningSlotId] = useState('');
  const [reservationDate, setReservationDate] = useState(minDate);
  const [partySize, setPartySize] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (slots.length === 0) return null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!diningSlotId || !reservationDate) return;
    setSubmitting(true);
    setError(null);
    const result = await reserveDining(accessToken, bookingId, {
      diningSlotId,
      partySize,
      reservationDate: new Date(reservationDate),
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setDiningSlotId('');
    setPartySize(1);
    onReserved();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-2xl border border-dashed border-slate-300 p-4 sm:flex-row sm:items-end sm:flex-wrap">
      <div className="min-w-[14rem] flex-1">
        <label htmlFor="dining-select" className="mb-1.5 block text-sm font-medium text-slate-700">
          Adicionar reserva de restaurante
        </label>
        <select id="dining-select" value={diningSlotId} onChange={(e) => setDiningSlotId(e.target.value)} className={inputClassName}>
          <option value="">Selecione um horário</option>
          {slots.map(({ restaurant, slot }) => (
            <option key={slot.id} value={slot.id}>
              {restaurant.name} — {slot.label} ({formatTime(slot.startTime)}–{formatTime(slot.endTime)})
            </option>
          ))}
        </select>
      </div>
      <div className="sm:w-40">
        <label htmlFor="dining-date" className="mb-1.5 block text-sm font-medium text-slate-700">
          Data
        </label>
        <input
          id="dining-date"
          type="date"
          min={minDate}
          max={maxDate}
          value={reservationDate}
          onChange={(e) => setReservationDate(e.target.value)}
          className={inputClassName}
        />
      </div>
      <div className="sm:w-28">
        <label htmlFor="dining-party-size" className="mb-1.5 block text-sm font-medium text-slate-700">
          Pessoas
        </label>
        <input
          id="dining-party-size"
          type="number"
          min={1}
          max={maxPartySize}
          value={partySize}
          onChange={(e) => setPartySize(Number(e.target.value))}
          className={inputClassName}
        />
      </div>
      <button type="submit" disabled={submitting || !diningSlotId} className={buttonVariants({ variant: 'secondary' })}>
        {submitting ? 'Reservando…' : 'Reservar'}
      </button>
      {error && (
        <p role="alert" className="w-full rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}

function TripView() {
  const { accessToken } = useAuth();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [catalog, setCatalog] = useState<CruiseDetail | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const load = useCallback(
    async (silent = false) => {
      if (!accessToken) return;
      if (!silent) setState({ status: 'loading' });
      const result = await getMyBookings(accessToken);
      if (!result.ok) {
        setState({ status: 'error', message: result.message });
        return;
      }
      // A viagem atual — se houver mais de uma reserva CONFIRMED (viagens passadas), fica a mais recente.
      const confirmed = result.data.find((booking) => booking.status === 'CONFIRMED') ?? null;
      if (!confirmed) {
        setState({ status: 'empty' });
        return;
      }
      setState({ status: 'ready', booking: confirmed });

      const catalogResult = await getCruiseBySlug(confirmed.cruise.slug);
      if (catalogResult.ok && catalogResult.data) {
        setCatalog(catalogResult.data);
        setCatalogError(null);
      } else {
        setCatalogError(catalogResult.ok ? 'Não foi possível carregar as atividades deste cruzeiro.' : catalogResult.message);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    load();
  }, [load]);

  async function withBusy(id: string, action: () => Promise<void>) {
    setBusyIds((prev) => new Set(prev).add(id));
    await action();
    setBusyIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  if (state.status === 'loading') {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    );
  }

  if (state.status === 'error') {
    return <ErrorState message={state.message} />;
  }

  if (state.status === 'empty') {
    return (
      <EmptyState
        icon={<Ship className="h-6 w-6" aria-hidden="true" />}
        title="Nenhuma viagem confirmada ainda"
        description="Assim que uma reserva sua for confirmada, ela aparece aqui — com espaço para reservar eventos e restaurantes a bordo."
      />
    );
  }

  const { booking } = state;
  // `load()` so chega ao estado "ready" com um token valido (ver guarda no topo da funcao) —
  // isto so protege contra o caso raro de logout acontecer entre o load e este render.
  if (!accessToken) return null;
  const maxPartySize = booking.cabin.cabinCategory.maxOccupancy;
  const confirmedEventIds = new Set(
    booking.eventReservations.filter((r) => r.status === 'CONFIRMED').map((r) => r.eventId),
  );
  const reservableEvents = catalog?.events.filter((event) => !confirmedEventIds.has(event.id)) ?? [];
  const activeEventReservations = booking.eventReservations.filter((r) => r.status === 'CONFIRMED');
  const activeDiningReservations = booking.diningReservations.filter((r) => r.status === 'CONFIRMED');

  return (
    <div className="flex flex-col gap-12">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Badge tone="success">Confirmada</Badge>
            <h3 className="mt-2 font-display text-xl font-bold text-slate-900">{booking.cruise.title}</h3>
            <p className="mt-1 text-sm text-slate-600">
              Embarque em {formatDate(booking.cruise.embarkationDate)} · Cabine {booking.cabin.code} (
              {booking.cabin.cabinCategory.name})
            </p>
          </div>
          <ul className="text-sm text-slate-600">
            {booking.guests.map((guest) => (
              <li key={guest.id}>{guest.fullName}{guest.isPrimary ? ' (titular)' : ''}</li>
            ))}
          </ul>
        </div>

        {booking.experiences.length > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Experiências selecionadas</p>
            <ul className="flex flex-wrap gap-2">
              {booking.experiences.map((experience) => (
                <li key={experience.id}>
                  <Badge tone="brand">
                    {experience.experience.title} · {experience.partySize} pessoa{experience.partySize > 1 ? 's' : ''}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {catalogError && <ErrorState title="Não foi possível carregar as atividades a bordo" message={catalogError} />}

      <div>
        <SectionHeading
          eyebrow="Programação"
          title="Eventos"
          icon={<Mic2 className="h-6 w-6 text-brand-600" aria-hidden="true" />}
          description="Adicione shows e atrações à sua viagem — sujeitos à capacidade do venue."
        />
        <div className="flex flex-col gap-3">
          {activeEventReservations.map((reservation) => (
            <div
              key={reservation.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div>
                <p className="font-display font-semibold text-slate-900">{reservation.event.title}</p>
                <p className="text-sm text-slate-600">
                  {formatDayMonth(reservation.event.startAt)} · {formatTime(reservation.event.startAt)}–
                  {formatTime(reservation.event.endAt)} · {reservation.event.venue.name} ·{' '}
                  {reservation.partySize} pessoa{reservation.partySize > 1 ? 's' : ''}
                </p>
              </div>
              <CancelButton
                busy={busyIds.has(reservation.id)}
                onCancel={() =>
                  withBusy(reservation.id, async () => {
                    const result = await cancelEventReservation(accessToken, booking.id, reservation.id);
                    if (result.ok) await load(true);
                  })
                }
              />
            </div>
          ))}
          {activeEventReservations.length === 0 && (
            <p className="text-sm text-slate-500">Nenhum evento reservado ainda.</p>
          )}
          {catalog && accessToken && (
            <AddEventForm
              bookingId={booking.id}
              maxPartySize={maxPartySize}
              events={reservableEvents}
              accessToken={accessToken}
              onReserved={() => load(true)}
            />
          )}
        </div>
      </div>

      <div>
        <SectionHeading
          eyebrow="Gastronomia"
          title="Restaurantes"
          icon={<UtensilsCrossed className="h-6 w-6 text-brand-600" aria-hidden="true" />}
          description="Reserve horários de restaurante para os dias da sua viagem."
        />
        <div className="flex flex-col gap-3">
          {activeDiningReservations.map((reservation) => (
            <div
              key={reservation.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div>
                <p className="font-display font-semibold text-slate-900">
                  {reservation.diningSlot.restaurant.name} · {reservation.diningSlot.label}
                </p>
                <p className="text-sm text-slate-600">
                  {formatDate(reservation.reservationDate)} · {formatTime(reservation.diningSlot.startTime)}–
                  {formatTime(reservation.diningSlot.endTime)} · {reservation.partySize} pessoa
                  {reservation.partySize > 1 ? 's' : ''}
                </p>
              </div>
              <CancelButton
                busy={busyIds.has(reservation.id)}
                onCancel={() =>
                  withBusy(reservation.id, async () => {
                    const result = await cancelDiningReservation(accessToken, booking.id, reservation.id);
                    if (result.ok) await load(true);
                  })
                }
              />
            </div>
          ))}
          {activeDiningReservations.length === 0 && (
            <p className="text-sm text-slate-500">Nenhuma reserva de restaurante ainda.</p>
          )}
          {catalog && accessToken && (
            <AddDiningForm
              bookingId={booking.id}
              maxPartySize={maxPartySize}
              restaurants={catalog.ship.restaurants}
              minDate={toDateInputValue(catalog.embarkationDate)}
              maxDate={toDateInputValue(catalog.disembarkationDate)}
              accessToken={accessToken}
              onReserved={() => load(true)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default function MyTripPage() {
  return (
    <RequireRole roles={['PASSENGER']}>
      <Container className="py-10">
        <SectionHeading
          eyebrow="Sua viagem"
          title="Minha viagem"
          description="Sua cabine, hóspedes e as atividades de bordo já adicionadas — reserve eventos e restaurantes direto por aqui."
          icon={<CalendarCheck className="h-6 w-6 text-accent-600" aria-hidden="true" />}
        />
        <TripView />
      </Container>
    </RequireRole>
  );
}
