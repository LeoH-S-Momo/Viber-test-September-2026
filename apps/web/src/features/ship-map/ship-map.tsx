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

/** So a REFERENCIA do que foi clicado — o objeto cheio (com disponibilidade atual) e derivado
 * de `decks` a cada render, nunca congelado no momento do clique (ver comentario acima de
 * `selection` abaixo pro porque). */
type SelectionRef =
  | { kind: 'cabin'; deckId: string; cabinId: string }
  | { kind: 'venue'; deckId: string; venueId: string }
  | { kind: 'restaurant'; deckId: string; restaurantId: string };

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
  const [selectionRef, setSelectionRef] = useState<SelectionRef | null>(null);

  const selectedDeck = useMemo(
    () => decks.find((deck) => deck.id === selectedDeckId) ?? null,
    [decks, selectedDeckId],
  );

  /**
   * Deriva o objeto de selecao completo (com disponibilidade/preco atuais) de `decks` A CADA
   * RENDER, em vez de guardar o objeto congelado no momento do clique — fechar o modal de
   * reserva chama `router.refresh()` (ver cabin-booking-flow.tsx), que traz um `decks` novo com
   * a disponibilidade pos-reserva, mas SEM isto o painel de detalhe continuava mostrando a
   * cabine recem-reservada como "Disponível" com o botao "Selecionar cabine" habilitado, ate o
   * usuario clicar em outra coisa e voltar (bug encontrado e corrigido na revisao geral de
   * 2026-09-05). Se a cabine/instalacao selecionada sumir do `decks` atualizado (ex.: deck
   * removido), a selecao simplesmente deixa de resolver e o painel volta ao estado vazio.
   */
  const selection = useMemo<DeckMapSelection | null>(() => {
    if (!selectionRef) return null;
    const deck = decks.find((d) => d.id === selectionRef.deckId);
    if (!deck) return null;
    if (selectionRef.kind === 'cabin') {
      const cabin = deck.cabins.find((c) => c.id === selectionRef.cabinId);
      return cabin ? { kind: 'cabin', deck, cabin } : null;
    }
    if (selectionRef.kind === 'venue') {
      const venue = deck.venues.find((v) => v.id === selectionRef.venueId);
      return venue ? { kind: 'venue', deck, venue } : null;
    }
    const restaurant = deck.restaurants.find((r) => r.id === selectionRef.restaurantId);
    return restaurant ? { kind: 'restaurant', deck, restaurant } : null;
  }, [decks, selectionRef]);

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
    setSelectionRef(null);
  }

  function handleSelectCabin(cabin: DeckMapCabin) {
    if (!selectedDeck) return;
    setSelectionRef({ kind: 'cabin', deckId: selectedDeck.id, cabinId: cabin.id });
  }

  function handleSelectFacility(item: FacilityItem) {
    if (!selectedDeck) return;
    if (item.kind === 'venue') {
      setSelectionRef({ kind: 'venue', deckId: selectedDeck.id, venueId: item.venue.id });
    } else {
      setSelectionRef({ kind: 'restaurant', deckId: selectedDeck.id, restaurantId: item.restaurant.id });
    }
  }

  return (
    <div id="mapa-do-navio" className="scroll-mt-20">
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
          <MapDetailPanel selection={selection} onClose={() => setSelectionRef(null)} onSelectCabin={onSelectCabin} />
          <MapLegend />
        </div>
      </div>
    </div>
  );
}
