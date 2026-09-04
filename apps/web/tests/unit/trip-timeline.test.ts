import { describe, expect, it } from 'vitest';
import { buildTripTimeline } from '@/lib/trip-timeline';
import type { ItineraryStop } from '@/types/cruise';
import type { EventReservation, DiningReservation } from '@/types/activity';

const EMBARKATION = '2027-10-01T18:00:00.000Z';
const DISEMBARKATION = '2027-10-05T09:00:00.000Z';

function stop(overrides: Partial<ItineraryStop>): ItineraryStop {
  return {
    id: `stop-${Math.random()}`,
    dayNumber: 1,
    isEmbarkation: false,
    isDisembarkation: false,
    arrivalAt: null,
    departureAt: null,
    port: { id: 'port-1', name: 'Búzios', country: 'Brasil', unLocode: null, timezone: null },
    ...overrides,
  };
}

function eventReservation(overrides: Partial<EventReservation> = {}): EventReservation {
  return {
    id: 'ev-res-1',
    eventId: 'event-1',
    bookingId: 'booking-1',
    partySize: 2,
    status: 'CONFIRMED',
    event: {
      id: 'event-1',
      title: 'Show de Abertura',
      startAt: '2027-10-02T22:00:00.000Z',
      endAt: '2027-10-03T00:00:00.000Z',
      capacity: 50,
      venue: { id: 'venue-1', name: 'Teatro Principal' },
      artist: null,
    },
    ...overrides,
  };
}

function diningReservation(overrides: Partial<DiningReservation> = {}): DiningReservation {
  return {
    id: 'dn-res-1',
    diningSlotId: 'slot-1',
    bookingId: 'booking-1',
    partySize: 2,
    reservationDate: '2027-10-02T00:00:00.000Z',
    status: 'CONFIRMED',
    diningSlot: {
      id: 'slot-1',
      label: 'Primeiro turno',
      startTime: '1970-01-01T19:00:00.000Z',
      endTime: '1970-01-01T21:00:00.000Z',
      capacity: 30,
      restaurant: { id: 'restaurant-1', name: 'Salão Azul' },
    },
    ...overrides,
  };
}

describe('buildTripTimeline', () => {
  it('places embarkation on day 1 at the real cruise embarkation time', () => {
    const timeline = buildTripTimeline({
      embarkationDate: EMBARKATION,
      disembarkationDate: DISEMBARKATION,
      itineraryStops: [stop({ dayNumber: 1, isEmbarkation: true })],
      events: [],
      dinings: [],
      checkIns: [],
    });

    expect(timeline.days).toHaveLength(1);
    expect(timeline.days[0]?.dayNumber).toBe(1);
    expect(timeline.days[0]?.items[0]).toMatchObject({ kind: 'embarkation', title: 'Embarque' });
    expect(timeline.days[0]?.items[0]?.time?.toISOString()).toBe(EMBARKATION);
  });

  it('groups a dining reservation into the day matching its reservationDate, at the combined date+time', () => {
    const timeline = buildTripTimeline({
      embarkationDate: EMBARKATION,
      disembarkationDate: DISEMBARKATION,
      itineraryStops: [],
      events: [],
      dinings: [diningReservation()],
      checkIns: [],
    });

    // 2027-10-02 is day 2 relative to a 2027-10-01 embarkation.
    expect(timeline.days).toHaveLength(1);
    expect(timeline.days[0]?.dayNumber).toBe(2);
    const item = timeline.days[0]?.items[0];
    expect(item?.kind).toBe('dining');
    expect(item?.time?.getUTCHours()).toBe(19);
    expect(item?.cancel).toEqual({ kind: 'dining', reservationId: 'dn-res-1' });
  });

  it('sorts same-day items chronologically regardless of input order', () => {
    const timeline = buildTripTimeline({
      embarkationDate: EMBARKATION,
      disembarkationDate: DISEMBARKATION,
      itineraryStops: [],
      events: [
        eventReservation({
          event: { ...eventReservation().event, startAt: '2027-10-02T22:00:00.000Z', endAt: '2027-10-02T23:00:00.000Z' },
        }),
      ],
      dinings: [diningReservation()], // 19:00 on the same day (day 2)
      checkIns: [],
    });

    expect(timeline.days).toHaveLength(1);
    const [first, second] = timeline.days[0]!.items;
    expect(first?.kind).toBe('dining'); // 19:00
    expect(second?.kind).toBe('event'); // 22:00
  });

  it('places a port stop with no known time first in its day, without a clock time', () => {
    const timeline = buildTripTimeline({
      embarkationDate: EMBARKATION,
      disembarkationDate: DISEMBARKATION,
      itineraryStops: [stop({ dayNumber: 2, arrivalAt: null, departureAt: null })],
      events: [
        eventReservation({
          event: { ...eventReservation().event, startAt: '2027-10-02T22:00:00.000Z', endAt: '2027-10-02T23:00:00.000Z' },
        }),
      ],
      dinings: [],
      checkIns: [],
    });

    expect(timeline.days[0]?.items[0]).toMatchObject({ kind: 'port-arrival', time: null });
    expect(timeline.days[0]?.items[1]?.kind).toBe('event');
  });

  it('produces separate arrival and departure entries for an intermediate port stop with both timestamps', () => {
    const timeline = buildTripTimeline({
      embarkationDate: EMBARKATION,
      disembarkationDate: DISEMBARKATION,
      itineraryStops: [
        stop({ dayNumber: 2, arrivalAt: '2027-10-02T08:00:00.000Z', departureAt: '2027-10-02T18:00:00.000Z' }),
      ],
      events: [],
      dinings: [],
      checkIns: [],
    });

    expect(timeline.days[0]?.items.map((i) => i.kind)).toEqual(['port-arrival', 'port-departure']);
  });

  it('includes a real check-in timestamp per guest, never a fabricated one', () => {
    const timeline = buildTripTimeline({
      embarkationDate: EMBARKATION,
      disembarkationDate: DISEMBARKATION,
      itineraryStops: [],
      events: [],
      dinings: [],
      checkIns: [{ guestName: 'Ana', checkedInAt: '2027-10-01T14:32:00.000Z', location: 'Portão A' }],
    });

    expect(timeline.days[0]?.dayNumber).toBe(1);
    expect(timeline.days[0]?.items[0]).toMatchObject({
      kind: 'checkin',
      title: 'Check-in — Ana',
      subtitle: 'Portão A',
    });
  });

  it('excludes cancelled reservations from the timeline', () => {
    const timeline = buildTripTimeline({
      embarkationDate: EMBARKATION,
      disembarkationDate: DISEMBARKATION,
      itineraryStops: [],
      events: [eventReservation({ status: 'CANCELLED' })],
      dinings: [diningReservation({ status: 'CANCELLED' })],
      checkIns: [],
    });

    expect(timeline.days).toHaveLength(0);
  });

  it('nextUp picks the earliest item at or after `now`, ignoring past items', () => {
    const timeline = buildTripTimeline({
      embarkationDate: EMBARKATION,
      disembarkationDate: DISEMBARKATION,
      itineraryStops: [stop({ dayNumber: 1, isEmbarkation: true })], // 2027-10-01T18:00Z — in the past relative to `now` below
      events: [eventReservation()], // 2027-10-02T22:00Z — future
      dinings: [diningReservation()], // 2027-10-02T19:00Z — future, earlier than the event
      checkIns: [],
      now: new Date('2027-10-02T00:00:00.000Z'),
    });

    expect(timeline.nextUp?.kind).toBe('dining');
  });

  it('nextUp is null when every real timestamp is already in the past', () => {
    const timeline = buildTripTimeline({
      embarkationDate: EMBARKATION,
      disembarkationDate: DISEMBARKATION,
      itineraryStops: [stop({ dayNumber: 1, isEmbarkation: true })],
      events: [],
      dinings: [],
      checkIns: [],
      now: new Date('2030-01-01T00:00:00.000Z'),
    });

    expect(timeline.nextUp).toBeNull();
  });
});
