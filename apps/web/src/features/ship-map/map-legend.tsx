import { AVAILABILITY_META } from './availability-meta';
import { RESTAURANT_META, VENUE_TYPE_META } from './venue-type-meta';
import type { CabinAvailability, VenueType } from '@/types/ship-map';

const AVAILABILITY_ORDER: CabinAvailability[] = ['AVAILABLE', 'HELD', 'BOOKED', 'UNAVAILABLE'];
const VENUE_TYPE_ORDER: VenueType[] = ['THEATER', 'LOUNGE', 'BAR', 'POOL', 'LEISURE', 'OTHER'];

export function MapLegend() {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Disponibilidade da cabine
        </p>
        <ul className="flex flex-col gap-1.5">
          {AVAILABILITY_ORDER.map((availability) => {
            const meta = AVAILABILITY_META[availability];
            return (
              <li key={availability} className="flex items-center gap-2">
                <span className={`h-3.5 w-3.5 shrink-0 rounded-sm border ${meta.swatchClassName}`} aria-hidden="true" />
                <span className="text-slate-700">{meta.label}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Instalações</p>
        <ul className="grid grid-cols-2 gap-1.5">
          {VENUE_TYPE_ORDER.map((type) => {
            const meta = VENUE_TYPE_META[type];
            const Icon = meta.icon;
            return (
              <li key={type} className="flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
                <span className="text-slate-700">{meta.label}</span>
              </li>
            );
          })}
          <li className="flex items-center gap-1.5">
            <RESTAURANT_META.icon className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
            <span className="text-slate-700">{RESTAURANT_META.label}</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
