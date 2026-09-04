/** Tipos do painel do organizador — espelham o que `GET /organizers/me/...` de fato devolve (ver ADR-0016). */

export interface DashboardSalesPoint {
  date: string;
  revenue: string;
  bookings: number;
}

export interface DashboardCabinCategoryOccupancy {
  categoryId: string;
  categoryName: string;
  totalCabins: number;
  booked: number;
  occupancyPercent: number;
}

export interface DashboardTopEvent {
  eventId: string;
  title: string;
  reservations: number;
}

export interface DashboardTopExperience {
  experienceId: string;
  title: string;
  reservations: number;
}

export interface OrganizerDashboard {
  revenue: string;
  bookingsCount: number;
  confirmedBookingsCount: number;
  cancellations: number;
  passengersCount: number;
  averageTicket: string;
  occupancyPercent: number;
  salesByPeriod: DashboardSalesPoint[];
  occupancyByCabinCategory: DashboardCabinCategoryOccupancy[];
  topEvents: DashboardTopEvent[];
  topExperiences: DashboardTopExperience[];
}

export type OrganizerBookingStatus =
  | 'HELD'
  | 'PAYMENT_PENDING'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'COMPLETED'
  | 'REFUNDED';

export interface OrganizerBooking {
  id: string;
  status: OrganizerBookingStatus;
  totalAmount: string;
  currency: string;
  confirmedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  cruise: { id: string; title: string; slug: string };
  cabin: { code: string; cabinCategory: { name: string } };
  user: { fullName: string; email: string };
  guests: Array<{ id: string; fullName: string; isPrimary: boolean }>;
}

export interface OrganizerPassenger {
  id: string;
  bookingId: string;
  fullName: string;
  documentType: 'PASSPORT' | 'NATIONAL_ID';
  documentNumber: string;
  isPrimary: boolean;
  booking: {
    id: string;
    status: OrganizerBookingStatus;
    cruise: { id: string; title: string };
    cabin: { code: string };
    user: { email: string };
  };
}

export interface OrganizerShip {
  id: string;
  name: string;
  imoNumber: string | null;
  description: string | null;
  yearBuilt: number | null;
  passengerCapacity: number;
  coverImageUrl: string | null;
}

export interface OrganizerEvent {
  id: string;
  title: string;
  description: string | null;
  category: string;
  startAt: string;
  endAt: string;
  capacity: number | null;
  isIncluded: boolean;
  price: string | null;
  venue: { id: string; name: string };
  artist: { id: string; name: string } | null;
  cruise: { id: string; title: string };
}

export interface OrganizerRestaurant {
  id: string;
  name: string;
  description: string | null;
  cuisineType: string | null;
  isIncluded: boolean;
  ship: { id: string; name: string };
  diningSlots: Array<{ id: string; label: string; startTime: string; endTime: string; capacity: number }>;
}

export interface OrganizerExperience {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  price: string | null;
  capacity: number | null;
  isIncluded: boolean;
  cruise: { id: string; title: string };
}

export type { PaginatedResult as PageResult } from './cruise';
