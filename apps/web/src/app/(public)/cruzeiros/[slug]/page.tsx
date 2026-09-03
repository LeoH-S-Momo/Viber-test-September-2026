import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Container } from '@/components/ui/container';
import { ErrorState } from '@/components/ui/error-state';
import { CruiseCabins } from '@/features/cruise-detail/cruise-cabins';
import { CruiseEvents } from '@/features/cruise-detail/cruise-events';
import { CruiseExperiences } from '@/features/cruise-detail/cruise-experiences';
import { CruiseHero } from '@/features/cruise-detail/cruise-hero';
import { CruiseItinerary } from '@/features/cruise-detail/cruise-itinerary';
import { CruiseOverview } from '@/features/cruise-detail/cruise-overview';
import { CruiseRestaurants } from '@/features/cruise-detail/cruise-restaurants';
import { CruiseVenues } from '@/features/cruise-detail/cruise-venues';
import { ShipMap } from '@/features/ship-map/ship-map';
import { getCruiseBySlug } from '@/services/cruises.service';
import { getCruiseDeckMap } from '@/services/ship-map.service';

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const result = await getCruiseBySlug(slug);
  if (!result.ok || !result.data) {
    return { title: 'Cruzeiro não encontrado' };
  }
  return {
    title: result.data.title,
    description: result.data.description ?? undefined,
  };
}

export default async function CruiseDetailPage({ params }: { params: Params }) {
  const { slug } = await params;
  // Disparadas juntas — o mapa do navio e um endpoint proprio (GET
  // /cruises/:slug/deck-map), buscado em paralelo pra nao virar um segundo
  // round-trip serial depois do detalhe do cruzeiro.
  const [result, deckMapResult] = await Promise.all([getCruiseBySlug(slug), getCruiseDeckMap(slug)]);

  if (!result.ok) {
    return (
      <Container className="py-16">
        <ErrorState message={result.message} />
      </Container>
    );
  }

  if (!result.data) {
    notFound();
  }

  const cruise = result.data;

  return (
    <div>
      <CruiseHero cruise={cruise} />

      <Container className="flex flex-col gap-16 py-12 sm:py-16">
        <CruiseOverview cruise={cruise} />

        {deckMapResult.ok ? (
          <ShipMap decks={deckMapResult.data ?? []} />
        ) : (
          <ErrorState title="Não foi possível carregar o mapa do navio" message={deckMapResult.message} />
        )}

        <CruiseItinerary stops={cruise.itineraryStops} />
        <CruiseVenues venues={cruise.ship.venues} />
        <CruiseEvents events={cruise.events} />
        <CruiseExperiences experiences={cruise.experiences} />
        <CruiseRestaurants restaurants={cruise.ship.restaurants} />
        <CruiseCabins pricings={cruise.cabinPricings} />
      </Container>
    </div>
  );
}
