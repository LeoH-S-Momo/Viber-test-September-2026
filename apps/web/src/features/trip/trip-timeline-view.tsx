import type { ComponentType } from 'react';
import { Anchor, CalendarClock, MapPin, Mic2, Navigation, ScanLine, Ship, UtensilsCrossed, X } from 'lucide-react';
import type { TimelineDay, TimelineItem, TimelineItemKind } from '@/lib/trip-timeline';
import { formatDayMonth, formatTime } from '@/lib/format';

const ICON_BY_KIND: Record<TimelineItemKind, ComponentType<{ className?: string }>> = {
  embarkation: Ship,
  disembarkation: Anchor,
  'port-arrival': MapPin,
  'port-departure': Navigation,
  checkin: ScanLine,
  event: Mic2,
  dining: UtensilsCrossed,
};

const COLOR_BY_KIND: Record<TimelineItemKind, string> = {
  embarkation: 'bg-brand-100 text-brand-700',
  disembarkation: 'bg-brand-100 text-brand-700',
  'port-arrival': 'bg-sky-100 text-sky-700',
  'port-departure': 'bg-sky-100 text-sky-700',
  checkin: 'bg-emerald-100 text-emerald-700',
  event: 'bg-accent-100 text-accent-700',
  dining: 'bg-amber-100 text-amber-700',
};

function dayDate(embarkationDate: Date, dayNumber: number): Date {
  return new Date(embarkationDate.getTime() + (dayNumber - 1) * 86_400_000);
}

function TimelineRow({
  item,
  isLast,
  busy,
  onCancel,
}: {
  item: TimelineItem;
  isLast: boolean;
  busy: boolean;
  onCancel?: () => void;
}) {
  const Icon = ICON_BY_KIND[item.kind];
  return (
    <div className="relative flex gap-4 pb-7 last:pb-0">
      {!isLast && <span className="absolute left-[15px] top-8 bottom-0 w-px bg-slate-200" aria-hidden="true" />}
      <div className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${COLOR_BY_KIND[item.kind]}`}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="flex-1 pt-0.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {item.time ? formatTime(item.time) : 'Horário a confirmar'}
          </p>
          {item.cancel && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-500 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
            >
              <X className="h-3 w-3" aria-hidden="true" />
              {busy ? 'Cancelando…' : 'Remover'}
            </button>
          )}
        </div>
        <p className="font-display font-semibold text-slate-900">{item.title}</p>
        {item.subtitle && <p className="text-sm text-slate-600">{item.subtitle}</p>}
      </div>
    </div>
  );
}

/**
 * Roteiro dia a dia — a resposta visual a "onde eu preciso estar e o que
 * tenho para fazer?" (ver ADR-0015). Cada linha vem de um dado real (nunca
 * um horário inventado); itens sem horário conhecido aparecem primeiro no
 * dia, marcados como "horário a confirmar" em vez de um relógio falso.
 */
export function TripTimelineView({
  days,
  embarkationDate,
  busyIds,
  onCancelEvent,
  onCancelDining,
}: {
  days: TimelineDay[];
  embarkationDate: string;
  busyIds: Set<string>;
  onCancelEvent: (reservationId: string) => void;
  onCancelDining: (reservationId: string) => void;
}) {
  if (days.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
        <CalendarClock className="mx-auto h-6 w-6 text-slate-400" aria-hidden="true" />
        <p className="mx-auto max-w-xs">
          Seu roteiro aparece aqui assim que houver compromissos — embarque, eventos ou restaurantes reservados.
        </p>
      </div>
    );
  }

  const embark = new Date(embarkationDate);

  return (
    <div className="flex flex-col gap-8">
      {days.map((day) => (
        <div key={day.dayNumber}>
          <div className="mb-4 flex items-baseline gap-2">
            <span className="rounded-full bg-brand-800 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
              Dia {day.dayNumber}
            </span>
            <span className="text-sm font-medium text-slate-500">{formatDayMonth(dayDate(embark, day.dayNumber))}</span>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            {day.items.map((item, index) => (
              <TimelineRow
                key={item.id}
                item={item}
                isLast={index === day.items.length - 1}
                busy={item.cancel ? busyIds.has(item.cancel.reservationId) : false}
                onCancel={
                  item.cancel
                    ? () =>
                        item.cancel!.kind === 'event' ? onCancelEvent(item.cancel!.reservationId) : onCancelDining(item.cancel!.reservationId)
                    : undefined
                }
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
