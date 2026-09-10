import { Ship } from 'lucide-react';
import type { CruiseSummary } from '@/types/cruise';

/** Ticker horizontal continuo com tema + data de cada cruzeiro — ver .animate-marquee em
 * globals.css. Duplica a lista uma vez (marcada aria-hidden) pra loop sem costura: a animacao
 * desliza exatamente 50% da largura total, entao a copia entra onde a original saiu. */
export function UpcomingMarquee({ cruises }: { cruises: CruiseSummary[] }) {
  if (cruises.length === 0) return null;

  const track = (
    <>
      {cruises.map((cruise) => (
        <span key={cruise.id} className="flex items-center gap-2 whitespace-nowrap px-6 text-sm font-medium text-white/90">
          <Ship className="h-4 w-4 text-accent-400" aria-hidden="true" />
          {cruise.title}
          <span className="text-white/40">·</span>
          <span className="text-white/60">{cruise.theme}</span>
        </span>
      ))}
    </>
  );

  return (
    <div className="overflow-hidden border-y border-white/10 bg-brand-950 py-3">
      <div className="flex w-max animate-marquee">
        <div className="flex shrink-0">{track}</div>
        <div className="flex shrink-0" aria-hidden="true">
          {track}
        </div>
      </div>
    </div>
  );
}
