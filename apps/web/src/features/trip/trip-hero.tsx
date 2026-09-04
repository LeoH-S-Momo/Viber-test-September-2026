import type { ComponentType } from 'react';
import { Anchor, BedDouble, MapPin, Mic2, Navigation, ScanLine, Ship, UtensilsCrossed, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { TimelineItem, TimelineItemKind } from '@/lib/trip-timeline';
import { formatDate, formatDayMonth, formatTime } from '@/lib/format';
import type { MyBooking } from '@/types/booking';

const ICON_BY_KIND: Record<TimelineItemKind, ComponentType<{ className?: string }>> = {
  embarkation: Ship,
  disembarkation: Anchor,
  'port-arrival': MapPin,
  'port-departure': Navigation,
  checkin: ScanLine,
  event: Mic2,
  dining: UtensilsCrossed,
};

const STATUS_LABEL: Record<MyBooking['status'], string> = {
  HELD: 'Reservada',
  PAYMENT_PENDING: 'Pagamento pendente',
  CONFIRMED: 'Confirmada',
  CANCELLED: 'Cancelada',
  EXPIRED: 'Expirada',
  COMPLETED: 'Concluída',
  REFUNDED: 'Reembolsada',
};

function NextUpCard({ nextUp }: { nextUp: TimelineItem | null }) {
  if (!nextUp) {
    return (
      <div className="rounded-2xl bg-white/10 p-4 text-sm text-white/80 backdrop-blur">
        Nenhum compromisso à frente no momento — aproveite para reservar eventos e restaurantes.
      </div>
    );
  }

  const Icon = ICON_BY_KIND[nextUp.kind];
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-white/10 p-4 backdrop-blur">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-brand-800">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Próximo na sua agenda</p>
        <p className="truncate font-display font-bold text-white">{nextUp.title}</p>
        <p className="text-sm text-white/80">
          {nextUp.time && `${formatDayMonth(nextUp.time)} · ${formatTime(nextUp.time)}`}
          {nextUp.subtitle && ` · ${nextUp.subtitle}`}
        </p>
      </div>
    </div>
  );
}

/**
 * Cabeçalho da Minha Viagem — a resposta imediata a "onde eu preciso estar e
 * o que tenho para fazer?" antes mesmo de rolar a página (ver ADR-0015).
 */
export function TripHero({
  booking,
  shipName,
  nextUp,
}: {
  booking: MyBooking;
  shipName: string | null;
  nextUp: TimelineItem | null;
}) {
  return (
    <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand-900 via-brand-800 to-accent-700 p-6 text-white shadow-lg sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge tone="success">{STATUS_LABEL[booking.status]}</Badge>
          <h1 className="mt-3 font-display text-2xl font-bold sm:text-3xl">{booking.cruise.title}</h1>
          <p className="mt-1 text-sm text-white/80">
            {shipName ? `${shipName} · ` : ''}
            Embarque em {formatDate(booking.cruise.embarkationDate)}
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl bg-white/10 p-3 backdrop-blur">
          <BedDouble className="h-4 w-4 text-white/70" aria-hidden="true" />
          <p className="mt-1 text-sm font-semibold">
            Cabine {booking.cabin.code}
          </p>
          <p className="text-xs text-white/70">{booking.cabin.cabinCategory.name}</p>
        </div>
        <div className="rounded-2xl bg-white/10 p-3 backdrop-blur">
          <Users className="h-4 w-4 text-white/70" aria-hidden="true" />
          <p className="mt-1 text-sm font-semibold">
            {booking.guests.length} passageiro{booking.guests.length > 1 ? 's' : ''}
          </p>
          <p className="text-xs text-white/70">{booking.guests.find((g) => g.isPrimary)?.fullName ?? '—'}</p>
        </div>
        <div className="col-span-2 sm:col-span-2">
          <NextUpCard nextUp={nextUp} />
        </div>
      </div>
    </div>
  );
}
