/** Espelha EventReservation/DiningReservation (backend) — ver ADR-0014. */
export type ActivityReservationStatus = 'CONFIRMED' | 'CANCELLED';

export interface EventReservation {
  id: string;
  eventId: string;
  bookingId: string;
  partySize: number;
  status: ActivityReservationStatus;
  event: {
    id: string;
    title: string;
    startAt: string;
    endAt: string;
    capacity: number | null;
    venue: { id: string; name: string };
    artist: { id: string; name: string } | null;
  };
}

export interface DiningReservation {
  id: string;
  diningSlotId: string;
  bookingId: string;
  partySize: number;
  reservationDate: string;
  status: ActivityReservationStatus;
  diningSlot: {
    id: string;
    label: string;
    startTime: string;
    endTime: string;
    capacity: number;
    restaurant: { id: string; name: string };
  };
}

export interface ActivityAvailability {
  capacity: number | null;
  reserved: number;
  available: number | null;
}
