import { Anchor, Waves } from 'lucide-react';
import { SectionHeading } from '@/components/ui/section-heading';
import { formatDayMonth } from '@/lib/format';
import type { ItineraryStop } from '@/types/cruise';

export function CruiseItinerary({ stops }: { stops: ItineraryStop[] }) {
  if (stops.length === 0) return null;

  return (
    <div>
      <SectionHeading
        eyebrow="Roteiro"
        title="Itinerário"
        icon={<Anchor className="h-6 w-6 text-brand-600" aria-hidden="true" />}
        description="Dia a dia da viagem, dos portos visitados aos dias de navegação livre."
      />

      <ol className="relative border-l border-slate-200 pl-6">
        {stops.map((stop) => (
          <li key={stop.id} className="mb-8 last:mb-0">
            <span className="absolute -left-[9px] flex h-4 w-4 items-center justify-center rounded-full bg-brand-600 ring-4 ring-white" />
            <div className="flex flex-wrap items-baseline gap-x-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-brand-700">
                Dia {stop.dayNumber}
              </span>
              {stop.arrivalAt && (
                <span className="text-xs text-slate-400">{formatDayMonth(stop.arrivalAt)}</span>
              )}
              {stop.isEmbarkation && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                  Embarque
                </span>
              )}
              {stop.isDisembarkation && (
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
                  Desembarque
                </span>
              )}
            </div>

            {stop.port ? (
              <p className="mt-1 flex items-center gap-1.5 font-medium text-slate-900">
                <Anchor className="h-4 w-4 text-slate-400" aria-hidden="true" />
                {stop.port.name}, {stop.port.country}
              </p>
            ) : (
              <p className="mt-1 flex items-center gap-1.5 font-medium text-slate-600">
                <Waves className="h-4 w-4 text-slate-400" aria-hidden="true" />
                Dia de navegação
              </p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
