import type { DiningReservation, EventReservation } from '@/types/activity';
import type { ItineraryStop } from '@/types/cruise';

export type TimelineItemKind =
  | 'embarkation'
  | 'disembarkation'
  | 'port-arrival'
  | 'port-departure'
  | 'checkin'
  | 'event'
  | 'dining';

export interface TimelineItem {
  id: string;
  kind: TimelineItemKind;
  /** `null` quando o horário exato não é conhecido (ex.: parada de porto sem `arrivalAt`/`departureAt`). */
  time: Date | null;
  dayNumber: number;
  title: string;
  subtitle?: string;
  cancel?: { kind: 'event' | 'dining'; reservationId: string };
}

export interface TimelineDay {
  dayNumber: number;
  items: TimelineItem[];
}

export interface TripTimeline {
  days: TimelineDay[];
  /** O próximo compromisso a partir de `now` — a resposta direta a "onde eu preciso estar?". */
  nextUp: TimelineItem | null;
}

export interface CheckInTimelineInput {
  guestName: string;
  checkedInAt: string;
  location: string | null;
}

export interface BuildTripTimelineInput {
  embarkationDate: string;
  disembarkationDate: string;
  itineraryStops: ItineraryStop[];
  events: EventReservation[];
  dinings: DiningReservation[];
  checkIns: CheckInTimelineInput[];
  now?: Date;
}

function dateOnlyUtc(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Numero do dia da viagem (dia do embarque = 1) — mesma comparação por dia (não hora) usada no backend (`assertDateWithinCruise`). */
function dayNumberFor(date: Date, embarkationDate: Date): number {
  return Math.round((dateOnlyUtc(date) - dateOnlyUtc(embarkationDate)) / 86_400_000) + 1;
}

/** `DiningSlot.startTime`/`endTime` são horários recorrentes (`1970-01-01THH:mm:ssZ") — mesma combinação do backend (`dining-schedule.util.ts`). */
function combineDateAndTime(date: Date, time: Date): Date {
  const combined = new Date(date);
  combined.setUTCHours(time.getUTCHours(), time.getUTCMinutes(), time.getUTCSeconds(), 0);
  return combined;
}

function itineraryItems(stops: ItineraryStop[], embarkationDate: Date, disembarkationDate: Date): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const stop of stops) {
    const portName = stop.port?.name ?? 'Porto';

    if (stop.isEmbarkation) {
      items.push({
        id: `embark-${stop.id}`,
        kind: 'embarkation',
        time: embarkationDate,
        dayNumber: stop.dayNumber,
        title: 'Embarque',
        subtitle: portName,
      });
      continue;
    }

    if (stop.isDisembarkation) {
      items.push({
        id: `disembark-${stop.id}`,
        kind: 'disembarkation',
        time: disembarkationDate,
        dayNumber: stop.dayNumber,
        title: 'Desembarque',
        subtitle: portName,
      });
      continue;
    }

    if (!stop.arrivalAt && !stop.departureAt) {
      items.push({
        id: `port-${stop.id}`,
        kind: 'port-arrival',
        time: null,
        dayNumber: stop.dayNumber,
        title: `Parada em ${portName}`,
      });
      continue;
    }

    if (stop.arrivalAt) {
      items.push({
        id: `port-arrival-${stop.id}`,
        kind: 'port-arrival',
        time: new Date(stop.arrivalAt),
        dayNumber: stop.dayNumber,
        title: `Chegada em ${portName}`,
      });
    }
    if (stop.departureAt) {
      items.push({
        id: `port-departure-${stop.id}`,
        kind: 'port-departure',
        time: new Date(stop.departureAt),
        dayNumber: stop.dayNumber,
        title: `Partida de ${portName}`,
      });
    }
  }

  return items;
}

/**
 * Monta a timeline dia a dia da viagem — sempre a partir de dados reais (nenhum
 * horário é inventado): embarque/desembarque, paradas de porto, eventos e
 * restaurantes reservados, e check-ins já realizados. `Experience` fica de
 * fora de propósito — o modelo não tem horário nenhum (ver ADR-0014), então
 * não há como posicioná-la de verdade num compromisso do dia.
 */
export function buildTripTimeline(input: BuildTripTimelineInput): TripTimeline {
  const embarkationDate = new Date(input.embarkationDate);
  const disembarkationDate = new Date(input.disembarkationDate);
  const now = input.now ?? new Date();

  const items: TimelineItem[] = [
    ...itineraryItems(input.itineraryStops, embarkationDate, disembarkationDate),
    ...input.events
      .filter((reservation) => reservation.status === 'CONFIRMED')
      .map((reservation): TimelineItem => {
        const start = new Date(reservation.event.startAt);
        return {
          id: `event-${reservation.id}`,
          kind: 'event',
          time: start,
          dayNumber: dayNumberFor(start, embarkationDate),
          title: reservation.event.title,
          subtitle: `${reservation.event.venue.name} · ${reservation.partySize} pessoa${reservation.partySize > 1 ? 's' : ''}`,
          cancel: { kind: 'event', reservationId: reservation.id },
        };
      }),
    ...input.dinings
      .filter((reservation) => reservation.status === 'CONFIRMED')
      .map((reservation): TimelineItem => {
        const reservationDate = new Date(reservation.reservationDate);
        const start = combineDateAndTime(reservationDate, new Date(reservation.diningSlot.startTime));
        return {
          id: `dining-${reservation.id}`,
          kind: 'dining',
          time: start,
          dayNumber: dayNumberFor(reservationDate, embarkationDate),
          title: `Jantar — ${reservation.diningSlot.restaurant.name}`,
          subtitle: `${reservation.diningSlot.label} · ${reservation.partySize} pessoa${reservation.partySize > 1 ? 's' : ''}`,
          cancel: { kind: 'dining', reservationId: reservation.id },
        };
      }),
    ...input.checkIns.map((checkIn, index): TimelineItem => {
      const time = new Date(checkIn.checkedInAt);
      return {
        id: `checkin-${index}-${checkIn.checkedInAt}`,
        kind: 'checkin',
        time,
        dayNumber: dayNumberFor(time, embarkationDate),
        title: `Check-in — ${checkIn.guestName}`,
        subtitle: checkIn.location ?? undefined,
      };
    }),
  ];

  const byDay = new Map<number, TimelineItem[]>();
  for (const item of items) {
    const bucket = byDay.get(item.dayNumber);
    if (bucket) bucket.push(item);
    else byDay.set(item.dayNumber, [item]);
  }

  const days: TimelineDay[] = [...byDay.entries()]
    .sort(([a], [b]) => a - b)
    .map(([dayNumber, dayItems]) => ({
      dayNumber,
      // Itens sem horário conhecido (parada de porto sem arrivalAt/departureAt) vêm primeiro no dia.
      items: [...dayItems].sort((a, b) => {
        if (a.time === null && b.time === null) return 0;
        if (a.time === null) return -1;
        if (b.time === null) return 1;
        return a.time.getTime() - b.time.getTime();
      }),
    }));

  const nextUp =
    items
      .filter((item): item is TimelineItem & { time: Date } => item.time !== null && item.time.getTime() >= now.getTime())
      .sort((a, b) => a.time.getTime() - b.time.getTime())[0] ?? null;

  return { days, nextUp };
}
