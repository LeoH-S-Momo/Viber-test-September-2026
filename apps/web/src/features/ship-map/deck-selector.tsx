import type { DeckMapDeck } from '@/types/ship-map';

export function DeckSelector({
  decks,
  selectedDeckId,
  onSelect,
}: {
  decks: DeckMapDeck[];
  selectedDeckId: string;
  onSelect: (deckId: string) => void;
}) {
  return (
    <div role="tablist" aria-label="Selecionar deck" className="flex flex-wrap gap-2">
      {decks.map((deck) => {
        const isSelected = deck.id === selectedDeckId;
        return (
          <button
            key={deck.id}
            type="button"
            role="tab"
            aria-selected={isSelected}
            onClick={() => onSelect(deck.id)}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
              isSelected
                ? 'border-brand-700 bg-brand-800 text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {deck.name ?? `Deck ${deck.number}`}
          </button>
        );
      })}
    </div>
  );
}
