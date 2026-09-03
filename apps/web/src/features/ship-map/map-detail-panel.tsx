import { MapPin, Ruler, Users, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button-styles';
import { formatPrice } from '@/lib/format';
import type { DeckMapCabin, DeckMapDeck, DeckMapSelection } from '@/types/ship-map';
import { AVAILABILITY_META } from './availability-meta';
import { RESTAURANT_META, VENUE_TYPE_META } from './venue-type-meta';

export function MapDetailPanel({
  selection,
  onClose,
  onSelectCabin,
}: {
  selection: DeckMapSelection | null;
  onClose: () => void;
  /** So fornecido pelo fluxo de checkout (ainda nao implementado) — ver ADR-0008. Sem isto, o painel e so informativo. */
  onSelectCabin?: (cabin: DeckMapCabin, deck: DeckMapDeck) => void;
}) {
  if (!selection) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
        <MapPin className="mb-2 h-6 w-6 text-slate-400" aria-hidden="true" />
        Clique numa cabine ou instalação no mapa para ver os detalhes aqui.
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl border border-slate-200 bg-white p-4">
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar detalhes"
        className="absolute right-3 top-3 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>

      {selection.kind === 'cabin' && (
        <CabinDetail deck={selection.deck} cabin={selection.cabin} onSelectCabin={onSelectCabin} />
      )}
      {selection.kind === 'venue' && <VenueDetail deck={selection.deck} venue={selection.venue} />}
      {selection.kind === 'restaurant' && <RestaurantDetail deck={selection.deck} restaurant={selection.restaurant} />}
    </div>
  );
}

function CabinDetail({
  deck,
  cabin,
  onSelectCabin,
}: {
  deck: DeckMapDeck;
  cabin: DeckMapCabin;
  onSelectCabin?: (cabin: DeckMapCabin, deck: DeckMapDeck) => void;
}) {
  const meta = AVAILABILITY_META[cabin.availability];
  const category = cabin.cabinCategory;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-accent-600">Cabine</p>
        <h3 className="font-display text-xl font-bold text-slate-900">Nº {cabin.code}</h3>
        <p className="text-sm text-slate-600">{category.name}</p>
      </div>

      <Badge tone={meta.badgeTone}>{meta.label}</Badge>
      <p className="-mt-2 text-xs text-slate-500">{meta.description}</p>

      <dl className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-sm">
        <div className="flex items-start gap-1.5">
          <Users className="mt-0.5 h-4 w-4 text-slate-400" aria-hidden="true" />
          <div>
            <dt className="text-xs text-slate-500">Capacidade</dt>
            <dd className="font-medium text-slate-900">até {category.maxOccupancy} pessoas</dd>
          </div>
        </div>
        <div className="flex items-start gap-1.5">
          <MapPin className="mt-0.5 h-4 w-4 text-slate-400" aria-hidden="true" />
          <div>
            <dt className="text-xs text-slate-500">Localização</dt>
            <dd className="font-medium text-slate-900">{deck.name ?? `Deck ${deck.number}`}</dd>
          </div>
        </div>
        {category.sizeSqm && (
          <div className="flex items-start gap-1.5">
            <Ruler className="mt-0.5 h-4 w-4 text-slate-400" aria-hidden="true" />
            <div>
              <dt className="text-xs text-slate-500">Área</dt>
              <dd className="font-medium text-slate-900">{category.sizeSqm} m²</dd>
            </div>
          </div>
        )}
      </dl>

      {category.description && (
        <div className="border-t border-slate-100 pt-3">
          <p className="text-xs text-slate-500">Características</p>
          <p className="text-sm text-slate-700">{category.description}</p>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-slate-100 pt-3">
        <div>
          <p className="text-xs text-slate-500">Preço</p>
          <p className="font-display text-lg font-bold text-brand-800">
            {cabin.price ? formatPrice(cabin.price) : 'Consulte'}
          </p>
        </div>
        {onSelectCabin && (
          <button
            type="button"
            disabled={cabin.availability !== 'AVAILABLE'}
            onClick={() => onSelectCabin(cabin, deck)}
            className={buttonVariants({ variant: 'primary', size: 'sm' })}
          >
            Selecionar cabine
          </button>
        )}
      </div>
    </div>
  );
}

function VenueDetail({
  deck,
  venue,
}: {
  deck: DeckMapDeck;
  venue: Extract<DeckMapSelection, { kind: 'venue' }>['venue'];
}) {
  const meta = VENUE_TYPE_META[venue.type];
  const Icon = meta.icon;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-accent-600">
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {meta.label}
        </p>
        <h3 className="font-display text-xl font-bold text-slate-900">{venue.name}</h3>
      </div>
      {venue.description && <p className="text-sm text-slate-700">{venue.description}</p>}
      <dl className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-sm">
        {venue.capacity !== null && (
          <div className="flex items-start gap-1.5">
            <Users className="mt-0.5 h-4 w-4 text-slate-400" aria-hidden="true" />
            <div>
              <dt className="text-xs text-slate-500">Capacidade</dt>
              <dd className="font-medium text-slate-900">{venue.capacity} pessoas</dd>
            </div>
          </div>
        )}
        <div className="flex items-start gap-1.5">
          <MapPin className="mt-0.5 h-4 w-4 text-slate-400" aria-hidden="true" />
          <div>
            <dt className="text-xs text-slate-500">Localização</dt>
            <dd className="font-medium text-slate-900">{deck.name ?? `Deck ${deck.number}`}</dd>
          </div>
        </div>
      </dl>
    </div>
  );
}

function RestaurantDetail({
  deck,
  restaurant,
}: {
  deck: DeckMapDeck;
  restaurant: Extract<DeckMapSelection, { kind: 'restaurant' }>['restaurant'];
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-accent-600">{RESTAURANT_META.label}</p>
        <h3 className="font-display text-xl font-bold text-slate-900">{restaurant.name}</h3>
        {restaurant.cuisineType && <p className="text-sm text-slate-600">{restaurant.cuisineType}</p>}
      </div>
      <Badge tone={restaurant.isIncluded ? 'success' : 'neutral'}>
        {restaurant.isIncluded ? 'Incluso' : 'Taxa adicional'}
      </Badge>
      {restaurant.description && <p className="text-sm text-slate-700">{restaurant.description}</p>}
      <p className="flex items-center gap-1.5 border-t border-slate-100 pt-3 text-sm text-slate-600">
        <MapPin className="h-4 w-4 text-slate-400" aria-hidden="true" />
        {deck.name ?? `Deck ${deck.number}`}
      </p>
    </div>
  );
}
