import type { DiningReservation, EventReservation } from './activity';

/** Espelha o retorno de GET /bookings/me e GET /bookings/:id (backend) — ver ADR-0010/ADR-0014. */
export type BookingStatus = 'HELD' | 'PAYMENT_PENDING' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED' | 'COMPLETED' | 'REFUNDED';

/**
 * Espelha o registro cru de `Booking` (Prisma) devolvido por POST
 * .../hold, PUT /bookings/:id/details e POST /bookings/:id/checkout — sem
 * includes, ao contrario de `MyBooking` (usado por GET /bookings/me e pela
 * pagina "Minha viagem"). Usado apenas pelo fluxo de reserva em si
 * (apps/web/src/features/booking/).
 */
export interface BookingHold {
  id: string;
  status: BookingStatus;
  cruiseId: string;
  cabinId: string;
  subtotalAmount: string;
  discountAmount: string;
  feeAmount: string;
  totalAmount: string;
  currency: string;
  holdExpiresAt: string;
}

export interface MyBookingGuest {
  id: string;
  fullName: string;
  documentType: 'PASSPORT' | 'NATIONAL_ID';
  documentNumber: string;
  isPrimary: boolean;
}

export interface MyBookingExperience {
  id: string;
  experienceId: string;
  priceAtBooking: string;
  partySize: number;
  experience: { id: string; title: string };
}

export interface MyBookingPayment {
  id: string;
  method: string;
  status: string;
  amount: string;
}

export interface MyBooking {
  id: string;
  status: BookingStatus;
  totalAmount: string;
  currency: string;
  confirmedAt: string | null;
  cruise: { id: string; title: string; slug: string; embarkationDate: string };
  cabin: { id: string; code: string; cabinCategory: { name: string; maxOccupancy: number } };
  guests: MyBookingGuest[];
  experiences: MyBookingExperience[];
  eventReservations: EventReservation[];
  diningReservations: DiningReservation[];
  payments: MyBookingPayment[];
}
