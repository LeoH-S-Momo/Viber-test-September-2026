import { Calendar, MapPin, Moon, Ship as ShipIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { CoverArt } from '@/components/ui/cover-art';
import { buttonVariants } from '@/components/ui/button-styles';
import { formatDate, formatDuration, formatPrice, minPrice } from '@/lib/format';
import type { CruiseDetail } from '@/types/cruise';

export function CruiseHero({ cruise }: { cruise: CruiseDetail }) {
  const from = minPrice(cruise.cabinPricings);

  return (
    <div className="relative overflow-hidden">
      <CoverArt
        imageUrl={cruise.coverImageUrl}
        seed={cruise.slug}
        title={cruise.title}
        className="h-72 w-full sm:h-96"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-brand-950/90 via-brand-950/30 to-transparent" />

      <div className="absolute inset-x-0 bottom-0">
        <div className="mx-auto max-w-7xl px-4 pb-6 sm:px-6 sm:pb-8 lg:px-8">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">{cruise.theme}</Badge>
            <span className="text-sm font-medium text-white/80">por {cruise.organizer.name}</span>
          </div>

          <h1 className="mt-2 font-display text-3xl font-extrabold text-white sm:text-5xl">
            {cruise.title}
          </h1>

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/90">
            <span className="flex items-center gap-1.5">
              <ShipIcon className="h-4 w-4" aria-hidden="true" />
              {cruise.ship.name}
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4" aria-hidden="true" />
              {cruise.embarkationPort.name} → {cruise.disembarkationPort.name}
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" aria-hidden="true" />
              {formatDate(cruise.embarkationDate)}
            </span>
            <span className="flex items-center gap-1.5">
              <Moon className="h-4 w-4" aria-hidden="true" />
              {formatDuration(cruise.embarkationDate, cruise.disembarkationDate)}
            </span>
          </div>

          <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs text-white/70">A partir de</p>
              <p className="font-display text-3xl font-bold text-white sm:text-4xl">
                {from !== null ? formatPrice(from) : 'Consulte disponibilidade'}
              </p>
            </div>
            <a href="#cabines" className={buttonVariants({ variant: 'primary', size: 'lg' })}>
              Ver cabines disponíveis
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
