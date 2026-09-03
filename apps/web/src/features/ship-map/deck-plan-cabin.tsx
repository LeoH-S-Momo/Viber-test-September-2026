import type { FocusEvent, KeyboardEvent, MouseEvent } from 'react';
import { AVAILABILITY_META } from './availability-meta';
import { categoryAccentColor } from './cabin-category-colors';
import type { PositionedCabin } from './layout/deck-layout-engine';
import type { TooltipPosition } from './map-tooltip';

export function DeckPlanCabin({
  positioned,
  isSelected,
  onHover,
  onLeave,
  onSelect,
}: {
  positioned: PositionedCabin;
  isSelected: boolean;
  onHover: (cabin: PositionedCabin['cabin'], position: TooltipPosition) => void;
  onLeave: () => void;
  onSelect: (cabin: PositionedCabin['cabin']) => void;
}) {
  const { cabin, rect } = positioned;
  const meta = AVAILABILITY_META[cabin.availability];
  const accent = categoryAccentColor(cabin.cabinCategory.id);

  function handleKeyDown(event: KeyboardEvent<SVGGElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(cabin);
    }
  }

  function handleFocus(event: FocusEvent<SVGGElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    onHover(cabin, { x: box.left + box.width / 2, y: box.top });
  }

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`Cabine ${cabin.code}, categoria ${cabin.cabinCategory.name}, ${meta.label.toLowerCase()}`}
      className="cursor-pointer outline-none"
      onMouseMove={(event: MouseEvent<SVGGElement>) => onHover(cabin, { x: event.clientX, y: event.clientY })}
      onMouseLeave={onLeave}
      onFocus={handleFocus}
      onBlur={onLeave}
      onClick={() => onSelect(cabin)}
      onKeyDown={handleKeyDown}
    >
      <rect
        x={rect.x}
        y={rect.y}
        width={rect.width}
        height={rect.height}
        rx={3}
        strokeWidth={isSelected ? 2.5 : 1}
        className={`transition-colors ${meta.className} ${isSelected ? 'stroke-brand-700' : ''}`}
      />
      <rect x={rect.x} y={rect.y} width={rect.width} height={3} fill={accent} rx={1.5} />
      {rect.width >= 30 && (
        <text
          x={rect.x + rect.width / 2}
          y={rect.y + rect.height / 2 + 4}
          textAnchor="middle"
          className="pointer-events-none select-none fill-slate-700 text-[9px] font-medium"
        >
          {cabin.code}
        </text>
      )}
    </g>
  );
}
