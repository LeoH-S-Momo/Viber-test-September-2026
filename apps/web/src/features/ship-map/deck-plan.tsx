'use client';

import { useState } from 'react';
import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import { DeckPlanCabin } from './deck-plan-cabin';
import { DeckPlanFacility } from './deck-plan-facility';
import { MapTooltip, type TooltipContent, type TooltipPosition } from './map-tooltip';
import { computeDeckLayout, type FacilityItem } from './layout/deck-layout-engine';
import { useZoomPan } from './use-zoom-pan';
import type { DeckMapCabin, DeckMapDeck, DeckMapSelection } from '@/types/ship-map';

export function DeckPlan({
  deck,
  selection,
  onSelectCabin,
  onSelectFacility,
}: {
  deck: DeckMapDeck;
  selection: DeckMapSelection | null;
  onSelectCabin: (cabin: DeckMapCabin) => void;
  onSelectFacility: (item: FacilityItem) => void;
}) {
  const layout = computeDeckLayout(deck);
  const zoomPan = useZoomPan();
  const [tooltip, setTooltip] = useState<{ content: TooltipContent; x: number; y: number } | null>(null);

  function handleHoverCabin(cabin: DeckMapCabin, position: TooltipPosition) {
    setTooltip({ content: { kind: 'cabin', cabin }, ...position });
  }

  function handleHoverFacility(item: FacilityItem, position: TooltipPosition) {
    setTooltip({ content: { kind: 'facility', item }, ...position });
  }

  const selectedCabinId = selection?.kind === 'cabin' ? selection.cabin.id : null;
  const selectedFacilityId =
    selection?.kind === 'venue' ? selection.venue.id : selection?.kind === 'restaurant' ? selection.restaurant.id : null;

  return (
    <div className="relative">
      <div className="absolute right-3 top-3 z-10 flex flex-col gap-1 rounded-lg border border-slate-200 bg-white/95 p-1 shadow-sm backdrop-blur">
        <button
          type="button"
          onClick={zoomPan.zoomIn}
          disabled={!zoomPan.canZoomIn}
          aria-label="Aumentar zoom"
          className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
        >
          <ZoomIn className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={zoomPan.zoomOut}
          disabled={!zoomPan.canZoomOut}
          aria-label="Diminuir zoom"
          className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
        >
          <ZoomOut className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={zoomPan.reset}
          disabled={!zoomPan.isZoomed}
          aria-label="Redefinir zoom"
          className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
        >
          <Maximize2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div
        className={`overflow-hidden rounded-2xl border border-slate-200 bg-sky-50 ${zoomPan.isZoomed ? (zoomPan.scale > 1 ? 'cursor-grab active:cursor-grabbing' : '') : ''}`}
        onWheel={zoomPan.dragHandlers.onWheel}
        onPointerDown={zoomPan.dragHandlers.onPointerDown}
        onPointerMove={zoomPan.dragHandlers.onPointerMove}
        onPointerUp={zoomPan.dragHandlers.onPointerUp}
      >
        <svg
          viewBox={`0 0 ${layout.viewBox.width} ${layout.viewBox.height}`}
          role="img"
          aria-label={`Planta do ${deck.name ?? `deck ${deck.number}`}`}
          className="h-auto w-full"
          style={{
            transform: `translate(${zoomPan.offset.x}px, ${zoomPan.offset.y}px) scale(${zoomPan.scale})`,
            transformOrigin: 'center',
          }}
        >
          <path d={layout.hullPath} className="fill-white stroke-slate-400" strokeWidth={2} />

          {layout.facilities.map((positioned) => (
            <DeckPlanFacility
              key={positioned.item.id}
              positioned={positioned}
              isSelected={positioned.item.id === selectedFacilityId}
              onHover={handleHoverFacility}
              onLeave={() => setTooltip(null)}
              onSelect={onSelectFacility}
            />
          ))}

          {layout.cabins.map((positioned) => (
            <DeckPlanCabin
              key={positioned.cabin.id}
              positioned={positioned}
              isSelected={positioned.cabin.id === selectedCabinId}
              onHover={handleHoverCabin}
              onLeave={() => setTooltip(null)}
              onSelect={onSelectCabin}
            />
          ))}
        </svg>
      </div>

      {tooltip && <MapTooltip content={tooltip.content} x={tooltip.x} y={tooltip.y} />}
    </div>
  );
}
