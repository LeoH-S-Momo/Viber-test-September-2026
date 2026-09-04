'use client';

import { useState, type FormEvent } from 'react';
import { CalendarPlus } from 'lucide-react';
import { SectionHeading } from '@/components/ui/section-heading';
import { buttonVariants } from '@/components/ui/button-styles';
import { formatDayMonth, formatTime } from '@/lib/format';
import { reserveDining, reserveEvent } from '@/services/activities.service';
import type { CruiseDetail } from '@/types/cruise';

const inputClassName =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500';

/** `Date` -> "YYYY-MM-DD", pro `min`/`max`/`value` de um `<input type="date">`. */
function toDateInputValue(value: string | Date): string {
  return new Date(value).toISOString().slice(0, 10);
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label htmlFor="event-select" className="mb-1.5 block text-sm font-medium text-slate-700">
          Evento
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
        {submitting ? 'Reservando…' : 'Adicionar ao roteiro'}
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="min-w-[14rem] flex-1">
        <label htmlFor="dining-select" className="mb-1.5 block text-sm font-medium text-slate-700">
          Restaurante
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
        {submitting ? 'Reservando…' : 'Adicionar ao roteiro'}
      </button>
      {error && (
        <p role="alert" className="w-full rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}

/** Duas mini-formas lado a lado para adicionar eventos/restaurantes ao roteiro — as únicas atividades que suportam "adicionar" pós-confirmação (ver ADR-0014/0015). */
export function AddActivityForms({
  bookingId,
  maxPartySize,
  catalog,
  reservableEvents,
  accessToken,
  onReserved,
}: {
  bookingId: string;
  maxPartySize: number;
  catalog: CruiseDetail;
  reservableEvents: CruiseDetail['events'];
  accessToken: string;
  onReserved: () => void;
}) {
  return (
    <div>
      <SectionHeading
        eyebrow="Roteiro"
        title="Adicionar ao roteiro"
        icon={<CalendarPlus className="h-6 w-6 text-brand-600" aria-hidden="true" />}
        description="Reserve mais eventos e horários de restaurante — sujeitos à capacidade e sem conflito com o que você já tem marcado."
      />
      <div className="flex flex-col gap-6 rounded-2xl border border-dashed border-slate-300 p-5">
        <AddEventForm
          bookingId={bookingId}
          maxPartySize={maxPartySize}
          events={reservableEvents}
          accessToken={accessToken}
          onReserved={onReserved}
        />
        <div className="border-t border-slate-100" />
        <AddDiningForm
          bookingId={bookingId}
          maxPartySize={maxPartySize}
          restaurants={catalog.ship.restaurants}
          minDate={toDateInputValue(catalog.embarkationDate)}
          maxDate={toDateInputValue(catalog.disembarkationDate)}
          accessToken={accessToken}
          onReserved={onReserved}
        />
      </div>
    </div>
  );
}
