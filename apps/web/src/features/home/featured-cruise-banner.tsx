import Link from 'next/link';
import { Calendar, MapPin, Sparkles } from 'lucide-react';
import { Container } from '@/components/ui/container';
import { buttonVariants } from '@/components/ui/button-styles';
import { formatDate, formatDuration, minPrice, formatPrice } from '@/lib/format';
import type { CruiseSummary } from '@/types/cruise';

/** Banner full-bleed pro cruzeiro de embarque mais próximo — spotlight editorial acima do grid
 * normal (que já não repete este cruzeiro, ver home/page.tsx). */
export function FeaturedCruiseBanner({ cruise }: { cruise: CruiseSummary }) {
  const from = minPrice(cruise.cabinPricings);

  return (
    <section className="relative isolate overflow-hidden">
      <div className="absolute inset-0 -z-10">
        {cruise.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL externa, sem loader configurado
          <img src={cruise.coverImageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-brand-900 to-brand-700" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/60 to-slate-950/20" />
      </div>

      <Container className="py-16 sm:py-24">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-accent-400">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          Embarque em destaque
        </p>
        <h2 className="max-w-xl font-display text-3xl font-extrabold leading-tight text-white sm:text-5xl">
          {cruise.title}
        </h2>
        <p className="mt-3 max-w-lg text-white/75">
          {cruise.organizer.name} · {cruise.ship.name}
        </p>
        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/80">
          {cruise.embarkationPort && (
            <span className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-accent-400" aria-hidden="true" />
              Saindo de {cruise.embarkationPort.name}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4 text-accent-400" aria-hidden="true" />
            {formatDate(cruise.embarkationDate)} · {formatDuration(cruise.embarkationDate, cruise.disembarkationDate)}
          </span>
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-6">
          <Link href={`/cruzeiros/${cruise.slug}`} className={buttonVariants({ variant: 'primary', size: 'lg' })}>
            Ver detalhes
          </Link>
          {from !== null && (
            <div>
              <p className="text-xs text-white/60">A partir de</p>
              <p className="font-display text-xl font-bold text-white">{formatPrice(from)}</p>
            </div>
          )}
        </div>
      </Container>
    </section>
  );
}
