import { formatPrice } from '@/lib/format';
import { AVAILABILITY_META } from './availability-meta';
import { RESTAURANT_META, VENUE_TYPE_META } from './venue-type-meta';
import type { DeckMapCabin } from '@/types/ship-map';
import type { FacilityItem } from './layout/deck-layout-engine';

export type TooltipContent = { kind: 'cabin'; cabin: DeckMapCabin } | { kind: 'facility'; item: FacilityItem };
export type TooltipPosition = { x: number; y: number };

/** Segue o cursor/foco — resumo rapido no hover; detalhe completo fica pro painel de clique. */
export function MapTooltip({ content, x, y }: { content: TooltipContent; x: number; y: number }) {
  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-50 max-w-56 -translate-x-1/2 -translate-y-full rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg"
      style={{ left: x, top: y - 10 }}
    >
      {content.kind === 'cabin' ? <CabinTooltipBody cabin={content.cabin} /> : <FacilityTooltipBody item={content.item} />}
    </div>
  );
}

function CabinTooltipBody({ cabin }: { cabin: DeckMapCabin }) {
  const meta = AVAILABILITY_META[cabin.availability];
  return (
    <>
      <p className="font-semibold">Cabine {cabin.code}</p>
      <p className="text-white/80">{cabin.cabinCategory.name}</p>
      <p className="mt-1 flex items-center justify-between gap-3">
        <span className="text-white/70">{meta.label}</span>
        {cabin.price && <span className="font-semibold">{formatPrice(cabin.price)}</span>}
      </p>
    </>
  );
}

function FacilityTooltipBody({ item }: { item: FacilityItem }) {
  const meta = item.kind === 'venue' ? VENUE_TYPE_META[item.venue.type] : RESTAURANT_META;
  return (
    <>
      <p className="font-semibold">{item.name}</p>
      <p className="text-white/80">{meta.label}</p>
    </>
  );
}
