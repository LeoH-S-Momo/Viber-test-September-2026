import { UtensilsCrossed } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { SectionHeading } from '@/components/ui/section-heading';
import { formatTime } from '@/lib/format';
import type { Restaurant } from '@/types/cruise';

export function CruiseRestaurants({ restaurants }: { restaurants: Restaurant[] }) {
  if (restaurants.length === 0) return null;

  return (
    <div>
      <SectionHeading
        eyebrow="Gastronomia"
        title="Restaurantes"
        icon={<UtensilsCrossed className="h-6 w-6 text-brand-600" aria-hidden="true" />}
        description="Opções gastronômicas disponíveis a bordo, com seus horários de funcionamento."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {restaurants.map((restaurant) => (
          <div key={restaurant.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display font-bold text-slate-900">{restaurant.name}</h3>
                {restaurant.cuisineType && (
                  <p className="text-xs uppercase tracking-wide text-slate-500">{restaurant.cuisineType}</p>
                )}
              </div>
              <Badge tone={restaurant.isIncluded ? 'success' : 'neutral'}>
                {restaurant.isIncluded ? 'Incluso' : 'Taxa adicional'}
              </Badge>
            </div>

            {restaurant.description && (
              <p className="mt-2 text-sm text-slate-600">{restaurant.description}</p>
            )}

            {restaurant.diningSlots.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3">
                {restaurant.diningSlots.map((slot) => (
                  <li key={slot.id} className="flex justify-between text-xs text-slate-600">
                    <span>{slot.label}</span>
                    <span>
                      {formatTime(slot.startTime)}–{formatTime(slot.endTime)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
