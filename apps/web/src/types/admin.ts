/** Tipos do painel administrativo global — espelham o que `GET /admin/...` de fato devolve (ver ADR-0018). */

export type AdminUserStatus = 'ACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';
export type AdminRoleKey = 'PASSENGER' | 'ORGANIZER_ADMIN' | 'ORGANIZER_STAFF' | 'PLATFORM_ADMIN';

export interface AdminUserRole {
  role: { key: AdminRoleKey };
  organizer: { id: string; name: string } | null;
}

export interface AdminUserListItem {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  status: AdminUserStatus;
  emailVerifiedAt: string | null;
  createdAt: string;
  roles: AdminUserRole[];
  _count: { bookings: number };
}

export interface AdminUserDetail extends Omit<AdminUserListItem, '_count'> {
  updatedAt: string;
  bookings: Array<{
    id: string;
    status: string;
    totalAmount: string;
    createdAt: string;
    cruise: { title: string };
  }>;
}

export type AdminOrganizerStatus = 'PENDING' | 'APPROVED' | 'SUSPENDED' | 'REJECTED';

export interface AdminOrganizerListItem {
  id: string;
  name: string;
  email: string;
  status: AdminOrganizerStatus;
  createdAt: string;
  approvedAt: string | null;
  _count: { ships: number; cruises: number };
}

export interface AdminOrganizerDetail extends AdminOrganizerListItem {
  slug: string;
  description: string | null;
  _count: { ships: number; cruises: number; coupons: number };
  userRoles: Array<{
    role: { key: AdminRoleKey };
    user: { id: string; email: string; fullName: string };
  }>;
}

export type AdminCruiseStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'COMPLETED';

export interface AdminCruiseListItem {
  id: string;
  title: string;
  slug: string;
  status: AdminCruiseStatus;
  embarkationDate: string;
  disembarkationDate: string;
  createdAt: string;
  ship: { name: string };
  organizer: { id: string; name: string };
  _count: { bookings: number };
}

export interface AdminCruiseDetail extends Omit<AdminCruiseListItem, 'ship'> {
  theme: string;
  ship: { id: string; name: string };
  embarkationPort: { name: string; country: string };
  disembarkationPort: { name: string; country: string };
  cabinPricings: Array<{ id: string; price: string; currency: string; cabinCategory: { name: string } }>;
  _count: { bookings: number; events: number; experiences: number };
}

export interface AdminShipListItem {
  id: string;
  name: string;
  imoNumber: string | null;
  passengerCapacity: number;
  createdAt: string;
  organizer: { id: string; name: string };
  _count: { cruises: number; decks: number };
}

export interface AdminShipDetail extends Omit<AdminShipListItem, '_count'> {
  description: string | null;
  yearBuilt: number | null;
  decks: Array<{ id: string; name: string; number: number; _count: { cabins: number } }>;
  _count: { cruises: number; venues: number; restaurants: number };
}

export type AdminCabinStatus = 'ACTIVE' | 'MAINTENANCE' | 'RETIRED';

export interface AdminCabinListItem {
  id: string;
  code: string;
  status: AdminCabinStatus;
  cabinCategory: { name: string; maxOccupancy: number };
  deck: { id: string; name: string; ship: { id: string; name: string } };
}

export interface AdminCabinDetail extends Omit<AdminCabinListItem, 'cabinCategory'> {
  cabinCategory: { id: string; name: string; maxOccupancy: number };
  bookings: Array<{ id: string; status: string; createdAt: string; cruise: { title: string } }>;
}

export interface AdminEventListItem {
  id: string;
  title: string;
  category: string;
  startAt: string;
  endAt: string;
  isIncluded: boolean;
  price: string | null;
  venue: { name: string };
  artist: { name: string } | null;
  cruise: { id: string; title: string };
  _count: { reservations: number };
}

export interface AdminEventDetail extends Omit<AdminEventListItem, 'venue' | 'artist' | 'cruise'> {
  description: string | null;
  capacity: number | null;
  venue: { id: string; name: string; type: string };
  artist: { id: string; name: string } | null;
  cruise: { id: string; title: string; organizer: { id: string; name: string } };
}

export interface AdminRestaurantListItem {
  id: string;
  name: string;
  cuisineType: string | null;
  isIncluded: boolean;
  ship: { id: string; name: string };
  _count: { diningSlots: number };
}

export interface AdminRestaurantDetail extends Omit<AdminRestaurantListItem, '_count'> {
  description: string | null;
  diningSlots: Array<{ id: string; label: string; startTime: string; endTime: string; capacity: number }>;
}

export interface AdminExperienceListItem {
  id: string;
  title: string;
  category: string | null;
  price: string | null;
  capacity: number | null;
  isIncluded: boolean;
  cruise: { id: string; title: string };
  _count: { bookings: number };
}

export interface AdminExperienceDetail extends Omit<AdminExperienceListItem, '_count'> {
  description: string | null;
  durationMinutes: number | null;
  cruise: { id: string; title: string; organizer: { id: string; name: string } };
}

export type AdminBookingStatus = 'HELD' | 'PAYMENT_PENDING' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED' | 'COMPLETED' | 'REFUNDED';

export interface AdminBookingListItem {
  id: string;
  status: AdminBookingStatus;
  totalAmount: string;
  currency: string;
  createdAt: string;
  cruise: { id: string; title: string };
  cabin: { code: string; cabinCategory: { name: string } };
  user: { id: string; fullName: string; email: string };
  guests: Array<{ id: string; fullName: string; isPrimary: boolean }>;
}

export interface AdminBookingDetail extends Omit<AdminBookingListItem, 'cruise' | 'guests'> {
  subtotalAmount: string;
  discountAmount: string;
  feeAmount: string;
  confirmedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  cruise: { id: string; title: string; organizer: { id: string; name: string } };
  guests: Array<{ id: string; fullName: string; documentType: string; documentNumber: string; isPrimary: boolean }>;
  payments: Array<{ id: string; status: string; method: string; amount: string; createdAt: string; paidAt: string | null }>;
  experiences: Array<{ experience: { title: string }; partySize: number }>;
  eventReservations: Array<{ event: { title: string }; partySize: number }>;
  diningReservations: Array<{ diningSlot: { label: string }; partySize: number }>;
  coupon: { code: string } | null;
}

export type AdminPaymentStatus = 'PENDING' | 'APPROVED' | 'DECLINED' | 'REFUNDED';
export type AdminPaymentMethod = 'CREDIT_CARD' | 'PIX' | 'BOLETO';

export interface AdminPaymentListItem {
  id: string;
  status: AdminPaymentStatus;
  method: AdminPaymentMethod;
  amount: string;
  currency: string;
  createdAt: string;
  paidAt: string | null;
  booking: { id: string; status: string; user: { fullName: string; email: string }; cruise: { title: string } };
}

export interface AdminPaymentDetail extends AdminPaymentListItem {
  failureReason: string | null;
  simulatedTransactionId: string;
  booking: { id: string; status: string; totalAmount: string; user: { fullName: string; email: string }; cruise: { title: string } };
}

export type AdminTicketStatus = 'ISSUED' | 'CHECKED_IN' | 'CANCELLED';

export interface AdminTicketListItem {
  id: string;
  qrCode: string;
  status: AdminTicketStatus;
  issuedAt: string;
  bookingGuest: { fullName: string; booking: { id: string; cruise: { title: string } } };
}

export interface AdminTicketDetail extends Omit<AdminTicketListItem, 'bookingGuest'> {
  bookingGuest: { fullName: string; booking: { id: string; status: string; cruise: { title: string }; cabin: { code: string } } };
  checkIns: Array<{ id: string; checkedInAt: string; location: string | null; staffUser: { fullName: string; email: string } }>;
}

export interface AdminCheckInListItem {
  id: string;
  checkedInAt: string;
  location: string | null;
  ticket: { qrCode: string; bookingGuest: { fullName: string } };
  staffUser: { fullName: string; email: string };
}

export type AdminCouponDiscountType = 'PERCENTAGE' | 'FIXED_AMOUNT';

export interface AdminCouponListItem {
  id: string;
  code: string;
  discountType: AdminCouponDiscountType;
  discountValue: string;
  isActive: boolean;
  usedCount: number;
  maxUses: number | null;
  validFrom: string;
  validUntil: string;
  organizer: { id: string; name: string } | null;
  _count: { bookings: number };
}

export interface AdminCouponDetail extends AdminCouponListItem {
  minPurchaseAmount: string | null;
  maxUsesPerUser: number | null;
  applicableCruises: Array<{ cruise: { id: string; title: string } }>;
}

export interface AdminCouponFormInput {
  code: string;
  organizerId?: string;
  discountType: AdminCouponDiscountType;
  discountValue: number;
  minPurchaseAmount?: number;
  maxUses?: number;
  maxUsesPerUser?: number;
  validFrom: string;
  validUntil: string;
  isActive: boolean;
  applicableCruiseIds: string[];
}

export interface AdminAuditLog {
  id: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
  actorUser: { email: string; fullName: string } | null;
}

export interface AdminAuditLogFacets {
  actions: string[];
  entityTypes: string[];
}
