'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Ship } from 'lucide-react';
import { Container } from '@/components/ui/container';
import { SectionHeading } from '@/components/ui/section-heading';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { RequireRole } from '@/components/require-role';
import { useAuth } from '@/lib/auth-context';
import { buildTripTimeline } from '@/lib/trip-timeline';
import { getMyBookings } from '@/services/bookings.service';
import { getCruiseBySlug } from '@/services/cruises.service';
import { getMyTickets } from '@/services/tickets.service';
import { cancelDiningReservation, cancelEventReservation } from '@/services/activities.service';
import { AddActivityForms } from '@/features/trip/add-activity-forms';
import { TripExperiences } from '@/features/trip/trip-experiences';
import { TripHero } from '@/features/trip/trip-hero';
import { TripInfo } from '@/features/trip/trip-info';
import { TripTickets } from '@/features/trip/trip-tickets';
import { TripTimelineView } from '@/features/trip/trip-timeline-view';
import type { MyBooking } from '@/types/booking';
import type { CruiseDetail } from '@/types/cruise';
import type { MyTicket } from '@/types/ticket';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty' }
  | { status: 'ready'; booking: MyBooking };

/**
 * Minha Viagem — a experiência central do passageiro pós-reserva (ver
 * docs/architecture/decisions/0015-minha-viagem.md): cruzeiro, navio,
 * cabine, passageiros, ingresso+QR Code, itinerário, eventos, restaurantes,
 * experiências, check-in e uma timeline dia a dia — tudo lido de APIs reais
 * (`GET /bookings/me`, `GET /tickets/me`, `GET /cruises/:slug`), nunca
 * fabricado no cliente.
 */
function TripView() {
  const { accessToken } = useAuth();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [catalog, setCatalog] = useState<CruiseDetail | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [tickets, setTickets] = useState<MyTicket[]>([]);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const load = useCallback(
    async (silent = false) => {
      if (!accessToken) return;
      if (!silent) setState({ status: 'loading' });

      const [bookingsResult, ticketsResult] = await Promise.all([getMyBookings(accessToken), getMyTickets(accessToken)]);

      if (!bookingsResult.ok) {
        setState({ status: 'error', message: bookingsResult.message });
        return;
      }
      // A viagem atual — se houver mais de uma reserva CONFIRMED (viagens passadas), fica a mais recente.
      const confirmed = bookingsResult.data.find((booking) => booking.status === 'CONFIRMED') ?? null;
      if (!confirmed) {
        setState({ status: 'empty' });
        return;
      }
      setState({ status: 'ready', booking: confirmed });
      setTickets(ticketsResult.ok ? ticketsResult.data : []);

      const catalogResult = await getCruiseBySlug(confirmed.cruise.slug);
      if (catalogResult.ok && catalogResult.data) {
        setCatalog(catalogResult.data);
        setCatalogError(null);
      } else {
        setCatalogError(catalogResult.ok ? 'Não foi possível carregar os detalhes deste cruzeiro.' : catalogResult.message);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    load();
  }, [load]);

  async function withBusy(id: string, action: () => Promise<void>) {
    setBusyIds((prev) => new Set(prev).add(id));
    await action();
    setBusyIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  const timeline = useMemo(() => {
    if (state.status !== 'ready' || !catalog) return null;
    const ticketsForBooking = tickets.filter((ticket) => ticket.bookingGuest.booking.id === state.booking.id);
    return buildTripTimeline({
      embarkationDate: catalog.embarkationDate,
      disembarkationDate: catalog.disembarkationDate,
      itineraryStops: catalog.itineraryStops,
      events: state.booking.eventReservations,
      dinings: state.booking.diningReservations,
      checkIns: ticketsForBooking
        .filter((ticket) => ticket.checkIns.length > 0)
        .map((ticket) => ({
          guestName: ticket.bookingGuest.fullName,
          checkedInAt: ticket.checkIns[0]!.checkedInAt,
          location: ticket.checkIns[0]!.location,
        })),
    });
  }, [state, catalog, tickets]);

  if (state.status === 'loading') {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-48 w-full rounded-3xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (state.status === 'error') {
    return <ErrorState message={state.message} />;
  }

  if (state.status === 'empty') {
    return (
      <EmptyState
        icon={<Ship className="h-6 w-6" aria-hidden="true" />}
        title="Nenhuma viagem confirmada ainda"
        description="Assim que uma reserva sua for confirmada, sua viagem aparece aqui — cabine, ingresso, roteiro dia a dia e tudo mais."
      />
    );
  }

  const { booking } = state;
  // `load()` so chega ao estado "ready" com um token valido (ver guarda no topo do metodo) —
  // isto so protege contra o caso raro de logout acontecer entre o load e este render.
  if (!accessToken) return null;

  const maxPartySize = booking.cabin.cabinCategory.maxOccupancy;
  const confirmedEventIds = new Set(
    booking.eventReservations.filter((reservation) => reservation.status === 'CONFIRMED').map((reservation) => reservation.eventId),
  );
  const reservableEvents = catalog?.events.filter((event) => !confirmedEventIds.has(event.id)) ?? [];
  const ticketsForBooking = tickets.filter((ticket) => ticket.bookingGuest.booking.id === booking.id);

  return (
    <div className="flex flex-col gap-12">
      <TripHero booking={booking} shipName={catalog?.ship.name ?? null} nextUp={timeline?.nextUp ?? null} />

      <div>
        <SectionHeading
          eyebrow="Seu roteiro"
          title="Dia a dia da viagem"
          icon={<CalendarCheck className="h-6 w-6 text-accent-600" aria-hidden="true" />}
          description="Onde você precisa estar e o que já está marcado — embarque, paradas de porto, eventos e restaurantes reservados."
        />
        {catalog && timeline ? (
          <TripTimelineView
            days={timeline.days}
            embarkationDate={catalog.embarkationDate}
            busyIds={busyIds}
            onCancelEvent={(reservationId) =>
              withBusy(reservationId, async () => {
                const result = await cancelEventReservation(accessToken, booking.id, reservationId);
                if (result.ok) await load(true);
              })
            }
            onCancelDining={(reservationId) =>
              withBusy(reservationId, async () => {
                const result = await cancelDiningReservation(accessToken, booking.id, reservationId);
                if (result.ok) await load(true);
              })
            }
          />
        ) : (
          <Skeleton className="h-40 w-full rounded-2xl" />
        )}
      </div>

      {catalogError && <ErrorState title="Não foi possível carregar o roteiro completo" message={catalogError} />}

      <TripTickets guests={booking.guests} tickets={ticketsForBooking} />

      {catalog && (
        <AddActivityForms
          bookingId={booking.id}
          maxPartySize={maxPartySize}
          catalog={catalog}
          reservableEvents={reservableEvents}
          accessToken={accessToken}
          onReserved={() => load(true)}
        />
      )}

      <TripExperiences experiences={booking.experiences} />

      {catalog && <TripInfo booking={booking} catalog={catalog} />}
    </div>
  );
}

export default function MyTripPage() {
  return (
    <RequireRole roles={['PASSENGER']}>
      <Container className="py-10">
        <SectionHeading
          eyebrow="Sua viagem"
          title="Minha viagem"
          description="Tudo sobre a sua viagem em um só lugar: cabine, ingresso, roteiro dia a dia e o que você ainda pode reservar."
          icon={<CalendarCheck className="h-6 w-6 text-accent-600" aria-hidden="true" />}
        />
        <TripView />
      </Container>
    </RequireRole>
  );
}
