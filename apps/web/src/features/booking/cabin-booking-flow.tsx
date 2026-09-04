'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShipMap } from '@/features/ship-map/ship-map';
import { useAuth } from '@/lib/auth-context';
import type { CruiseDeckMap, DeckMapCabin, DeckMapDeck } from '@/types/ship-map';
import { BookingModal } from './booking-modal';

/**
 * Ponte entre o mapa do navio (informativo, ADR-0008) e o fluxo de reserva
 * de verdade — o unico lugar do app onde `onSelectCabin` e fornecido de
 * fato. Sem login, manda pro /login com retorno pra esta pagina; com login,
 * abre o modal de reserva (hold -> hospedes -> pagamento). Um usuario sem
 * papel PASSENGER (ex.: organizador logado navegando o catalogo publico)
 * chega ate aqui normalmente — o hold em si e recusado pelo backend
 * (@Roles(PASSENGER) em POST .../hold) e o erro aparece no modal, em vez de
 * duplicar essa regra de autorizacao no cliente.
 */
export function CabinBookingFlow({ cruiseSlug, decks }: { cruiseSlug: string; decks: CruiseDeckMap }) {
  const { user, accessToken } = useAuth();
  const router = useRouter();
  const [target, setTarget] = useState<{ cabin: DeckMapCabin; deck: DeckMapDeck } | null>(null);

  function handleSelectCabin(cabin: DeckMapCabin, deck: DeckMapDeck) {
    if (!user || !accessToken) {
      router.push(`/login?redirect=${encodeURIComponent(`/cruzeiros/${cruiseSlug}`)}`);
      return;
    }
    setTarget({ cabin, deck });
  }

  return (
    <>
      <ShipMap decks={decks} onSelectCabin={handleSelectCabin} />
      {target && accessToken && (
        <BookingModal
          cabin={target.cabin}
          deck={target.deck}
          cruiseSlug={cruiseSlug}
          accessToken={accessToken}
          onClose={() => {
            setTarget(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
