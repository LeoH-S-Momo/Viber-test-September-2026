'use client';

import { useMemo, useState } from 'react';
import { LayoutPanelTop } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionHeading } from '@/components/ui/section-heading';
import type { CruiseDeckMap, DeckMapCabin, DeckMapDeck, DeckMapSelection } from '@/types/ship-map';
import { DeckPlan } from './deck-plan';
import { DeckSelector } from './deck-selector';
import { MapDetailPanel } from './map-detail-panel';
import { MapLegend } from './map-legend';
import type { FacilityItem } from './layout/deck-layout-engine';

export function ShipMap({
  decks,
  onSelectCabin,
}: {
  decks: CruiseDeckMap;
  /** So fornecido pelo fluxo de checkout (ainda nao implementado) — sem isto o mapa e so informativo. */
  onSelectCabin?: (cabin: DeckMapCabin, deck: DeckMapDeck) => void;
}) {
  const firstDeckId = decks[0]?.id ?? null;
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(firstDeckId);
  const [selection, setSelection] = useState<DeckMapSelection | null>(null);

  const selectedDeck = useMemo(
    () => decks.find((deck) => deck.id === selectedDeckId) ?? null,
    [decks, selectedDeckId],
  );

  if (decks.length === 0 || !selectedDeck) {
    return (
      <EmptyState
        icon={<LayoutPanelTop className="h-6 w-6" aria-hidden="true" />}
        title="Planta do navio indisponível"
        description="Este navio ainda não tem decks cadastrados para exibir no mapa interativo."
      />
    );
  }

  function selectDeck(deckId: string) {
    setSelectedDeckId(deckId);
    setSelection(null);
  }

  function handleSelectCabin(cabin: DeckMapCabin) {
    if (!selectedDeck) return;
    setSelection({ kind: 'cabin', deck: selectedDeck, cabin });
  }

  function handleSelectFacility(item: FacilityItem) {
    if (!selectedDeck) return;
    if (item.kind === 'venue') {
      setSelection({ kind: 'venue', deck: selectedDeck, venue: item.venue });
    } else {
      setSelection({ kind: 'restaurant', deck: selectedDeck, restaurant: item.restaurant });
    }
  }

  return (
    <div>
      <SectionHeading
        eyebrow="A bordo"
        title="Mapa do navio"
        icon={<LayoutPanelTop className="h-6 w-6 text-brand-600" aria-hidden="true" />}
        description="Navegue pelos decks, veja cabines, teatro, restaurantes, bares e áreas de lazer — clique em qualquer ponto para ver os detalhes."
      />

      <div className="mb-4">
        <DeckSelector decks={decks} selectedDeckId={selectedDeck.id} onSelect={selectDeck} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
        <DeckPlan
          key={selectedDeck.id}
          deck={selectedDeck}
          selection={selection}
          onSelectCabin={handleSelectCabin}
          onSelectFacility={handleSelectFacility}
        />

        <div className="flex flex-col gap-4">
          <MapDetailPanel selection={selection} onClose={() => setSelection(null)} onSelectCabin={onSelectCabin} />
          <MapLegend />
        </div>
      </div>
    </div>
  );
}
