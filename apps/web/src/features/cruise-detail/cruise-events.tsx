import { Mic2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { SectionHeading } from '@/components/ui/section-heading';
import { formatDayMonth, formatPrice, formatTime } from '@/lib/format';
import type { CruiseEvent } from '@/types/cruise';

export function CruiseEvents({ events }: { events: CruiseEvent[] }) {
  if (events.length === 0) return null;

  return (
    <div>
      <SectionHeading
        eyebrow="Programação"
        title="Eventos e shows"
        icon={<Mic2 className="h-6 w-6 text-brand-600" aria-hidden="true" />}
        description="Shows, palestras e atrações especiais programadas durante a viagem."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {events.map((event) => (
          <div key={event.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-accent-600">
                  {event.category}
                </p>
                <h3 className="font-display font-bold text-slate-900">{event.title}</h3>
              </div>
              <Badge tone={event.isIncluded ? 'success' : 'neutral'}>
                {event.isIncluded ? 'Incluso' : event.price ? formatPrice(event.price) : 'Avulso'}
              </Badge>
            </div>

            {event.artist && (
              <p className="mt-1 text-sm font-medium text-brand-700">com {event.artist.name}</p>
            )}

            {event.description && <p className="mt-2 text-sm text-slate-600">{event.description}</p>}

            <p className="mt-3 text-xs text-slate-500">
              {formatDayMonth(event.startAt)} · {formatTime(event.startAt)}–{formatTime(event.endAt)} ·{' '}
              {event.venue.name}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
