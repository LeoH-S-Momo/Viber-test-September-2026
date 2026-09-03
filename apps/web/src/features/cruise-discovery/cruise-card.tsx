import Link from 'next/link';
import { Calendar, MapPin, Ship as ShipIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { CoverArt } from '@/components/ui/cover-art';
import { formatDate, formatDuration, minPrice, formatPrice } from '@/lib/format';
import type { CruiseSummary } from '@/types/cruise';

export function CruiseCard({ cruise }: { cruise: CruiseSummary }) {
  const from = minPrice(cruise.cabinPricings);

  return (
    <Link
      href={`/cruzeiros/${cruise.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
    >
      <div className="relative">
        <CoverArt
          imageUrl={cruise.coverImageUrl}
          seed={cruise.slug}
          title={cruise.title}
          className="h-44 w-full"
        />
        <div className="absolute left-3 top-3">
          <Badge tone="accent">{cruise.theme}</Badge>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div>
          <p className="text-xs font-medium text-slate-500">{cruise.organizer.name}</p>
          <h3 className="font-display text-lg font-bold leading-snug text-slate-900 group-hover:text-brand-800">
            {cruise.title}
          </h3>
        </div>

        <div className="flex flex-col gap-1.5 text-sm text-slate-600">
          <span className="flex items-center gap-1.5">
            <ShipIcon className="h-4 w-4 text-slate-400" aria-hidden="true" />
            {cruise.ship.name}
          </span>
          {cruise.embarkationPort && (
            <span className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-slate-400" aria-hidden="true" />
              Saindo de {cruise.embarkationPort.name}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4 text-slate-400" aria-hidden="true" />
            {formatDate(cruise.embarkationDate)} ·{' '}
            {formatDuration(cruise.embarkationDate, cruise.disembarkationDate)}
          </span>
        </div>

        <div className="mt-auto flex items-end justify-between border-t border-slate-100 pt-3">
          <div>
            <p className="text-xs text-slate-500">A partir de</p>
            <p className="font-display text-xl font-bold text-brand-800">
              {from !== null ? formatPrice(from) : 'Consulte'}
            </p>
          </div>
          <span className="text-sm font-semibold text-accent-600 group-hover:underline">
            Ver detalhes →
          </span>
        </div>
      </div>
    </Link>
  );
}
