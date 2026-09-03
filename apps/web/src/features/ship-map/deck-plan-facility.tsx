import type { FocusEvent, KeyboardEvent, MouseEvent } from 'react';
import { RESTAURANT_META, VENUE_TYPE_META } from './venue-type-meta';
import type { FacilityItem, PositionedFacility } from './layout/deck-layout-engine';
import type { TooltipPosition } from './map-tooltip';

function metaFor(item: FacilityItem) {
  return item.kind === 'venue' ? VENUE_TYPE_META[item.venue.type] : RESTAURANT_META;
}

export function DeckPlanFacility({
  positioned,
  isSelected,
  onHover,
  onLeave,
  onSelect,
}: {
  positioned: PositionedFacility;
  isSelected: boolean;
  onHover: (item: FacilityItem, position: TooltipPosition) => void;
  onLeave: () => void;
  onSelect: (item: FacilityItem) => void;
}) {
  const { item, rect } = positioned;
  const meta = metaFor(item);
  const Icon = meta.icon;
  const iconSize = Math.min(20, rect.height * 0.4);

  function handleKeyDown(event: KeyboardEvent<SVGGElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(item);
    }
  }

  function handleFocus(event: FocusEvent<SVGGElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    onHover(item, { x: box.left + box.width / 2, y: box.top });
  }

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`${meta.label}: ${item.name}`}
      className="cursor-pointer outline-none"
      onMouseMove={(event: MouseEvent<SVGGElement>) => onHover(item, { x: event.clientX, y: event.clientY })}
      onMouseLeave={onLeave}
      onFocus={handleFocus}
      onBlur={onLeave}
      onClick={() => onSelect(item)}
      onKeyDown={handleKeyDown}
    >
      <rect
        x={rect.x}
        y={rect.y}
        width={rect.width}
        height={rect.height}
        rx={8}
        strokeWidth={isSelected ? 2.5 : 1.25}
        className={`transition-colors ${meta.className} ${isSelected ? 'stroke-brand-700' : ''}`}
      />
      <Icon
        x={rect.x + rect.width / 2 - iconSize / 2}
        y={rect.y + rect.height / 2 - iconSize - 2}
        width={iconSize}
        height={iconSize}
        className="pointer-events-none stroke-slate-700"
      />
      <text
        x={rect.x + rect.width / 2}
        y={rect.y + rect.height / 2 + iconSize / 2 + 6}
        textAnchor="middle"
        className="pointer-events-none select-none fill-slate-800 text-[10px] font-semibold"
      >
        {item.name.length > 18 ? `${item.name.slice(0, 17)}…` : item.name}
      </text>
    </g>
  );
}
