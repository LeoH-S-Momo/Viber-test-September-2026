import { authFetchJson, qs, type ServiceResult } from '@/lib/api-client';
import type { PaginatedResult } from '@/types/cruise';
import type {
  AdminAuditLog,
  AdminAuditLogFacets,
  AdminBookingDetail,
  AdminBookingListItem,
  AdminCabinDetail,
  AdminCabinListItem,
  AdminCheckInListItem,
  AdminCouponDetail,
  AdminCouponFormInput,
  AdminCouponListItem,
  AdminCruiseDetail,
  AdminCruiseListItem,
  AdminEventDetail,
  AdminEventListItem,
  AdminExperienceDetail,
  AdminExperienceListItem,
  AdminOrganizerDetail,
  AdminOrganizerListItem,
  AdminPaymentDetail,
  AdminPaymentListItem,
  AdminRestaurantDetail,
  AdminRestaurantListItem,
  AdminShipDetail,
  AdminShipListItem,
  AdminTicketDetail,
  AdminTicketListItem,
  AdminUserDetail,
  AdminUserListItem,
} from '@/types/admin';

// --- Usuarios ---

export interface AdminUsersFilter {
  q?: string;
  status?: string;
  role?: string;
}

export function listUsers(accessToken: string, filters: AdminUsersFilter, page: number) {
  return authFetchJson<PaginatedResult<AdminUserListItem>>(`/admin/users${qs({ ...filters, page })}`, accessToken);
}

export function getUser(accessToken: string, id: string): Promise<ServiceResult<AdminUserDetail>> {
  return authFetchJson<AdminUserDetail>(`/admin/users/${id}`, accessToken);
}

export function suspendUser(accessToken: string, id: string) {
  return authFetchJson(`/admin/users/${id}/suspend`, accessToken, { method: 'PATCH' });
}

export function reactivateUser(accessToken: string, id: string) {
  return authFetchJson(`/admin/users/${id}/reactivate`, accessToken, { method: 'PATCH' });
}

// --- Organizadores ---

export interface AdminOrganizersFilter {
  q?: string;
  status?: string;
}

export function listOrganizers(accessToken: string, filters: AdminOrganizersFilter, page: number) {
  return authFetchJson<PaginatedResult<AdminOrganizerListItem>>(`/admin/organizers${qs({ ...filters, page })}`, accessToken);
}

export function getOrganizer(accessToken: string, id: string): Promise<ServiceResult<AdminOrganizerDetail>> {
  return authFetchJson<AdminOrganizerDetail>(`/admin/organizers/${id}`, accessToken);
}

export function approveOrganizer(accessToken: string, id: string) {
  return authFetchJson(`/admin/organizers/${id}/approve`, accessToken, { method: 'PATCH' });
}

export function suspendOrganizer(accessToken: string, id: string) {
  return authFetchJson(`/admin/organizers/${id}/suspend`, accessToken, { method: 'PATCH' });
}

export function reactivateOrganizer(accessToken: string, id: string) {
  return authFetchJson(`/admin/organizers/${id}/reactivate`, accessToken, { method: 'PATCH' });
}

// --- Cruzeiros ---

export interface AdminCruisesFilter {
  q?: string;
  status?: string;
  organizerId?: string;
}

export function listCruises(accessToken: string, filters: AdminCruisesFilter, page: number) {
  return authFetchJson<PaginatedResult<AdminCruiseListItem>>(`/admin/cruises${qs({ ...filters, page })}`, accessToken);
}

export function getCruise(accessToken: string, id: string): Promise<ServiceResult<AdminCruiseDetail>> {
  return authFetchJson<AdminCruiseDetail>(`/admin/cruises/${id}`, accessToken);
}

export function cancelCruise(accessToken: string, id: string, reason?: string) {
  return authFetchJson(`/admin/cruises/${id}/cancel`, accessToken, { method: 'PATCH', body: JSON.stringify({ reason }) });
}

// --- Navios ---

export interface AdminShipsFilter {
  q?: string;
  organizerId?: string;
}

export function listShips(accessToken: string, filters: AdminShipsFilter, page: number) {
  return authFetchJson<PaginatedResult<AdminShipListItem>>(`/admin/ships${qs({ ...filters, page })}`, accessToken);
}

export function getShip(accessToken: string, id: string): Promise<ServiceResult<AdminShipDetail>> {
  return authFetchJson<AdminShipDetail>(`/admin/ships/${id}`, accessToken);
}

// --- Cabines ---

export interface AdminCabinsFilter {
  q?: string;
  shipId?: string;
  status?: string;
}

export function listCabins(accessToken: string, filters: AdminCabinsFilter, page: number) {
  return authFetchJson<PaginatedResult<AdminCabinListItem>>(`/admin/cabins${qs({ ...filters, page })}`, accessToken);
}

export function getCabin(accessToken: string, id: string): Promise<ServiceResult<AdminCabinDetail>> {
  return authFetchJson<AdminCabinDetail>(`/admin/cabins/${id}`, accessToken);
}

// --- Eventos ---

export interface AdminEventsFilter {
  q?: string;
  cruiseId?: string;
}

export function listEvents(accessToken: string, filters: AdminEventsFilter, page: number) {
  return authFetchJson<PaginatedResult<AdminEventListItem>>(`/admin/events${qs({ ...filters, page })}`, accessToken);
}

export function getEvent(accessToken: string, id: string): Promise<ServiceResult<AdminEventDetail>> {
  return authFetchJson<AdminEventDetail>(`/admin/events/${id}`, accessToken);
}

// --- Restaurantes ---

export interface AdminRestaurantsFilter {
  q?: string;
  shipId?: string;
}

export function listRestaurants(accessToken: string, filters: AdminRestaurantsFilter, page: number) {
  return authFetchJson<PaginatedResult<AdminRestaurantListItem>>(`/admin/restaurants${qs({ ...filters, page })}`, accessToken);
}

export function getRestaurant(accessToken: string, id: string): Promise<ServiceResult<AdminRestaurantDetail>> {
  return authFetchJson<AdminRestaurantDetail>(`/admin/restaurants/${id}`, accessToken);
}

// --- Experiencias ---

export interface AdminExperiencesFilter {
  q?: string;
  cruiseId?: string;
}

export function listExperiences(accessToken: string, filters: AdminExperiencesFilter, page: number) {
  return authFetchJson<PaginatedResult<AdminExperienceListItem>>(`/admin/experiences${qs({ ...filters, page })}`, accessToken);
}

export function getExperience(accessToken: string, id: string): Promise<ServiceResult<AdminExperienceDetail>> {
  return authFetchJson<AdminExperienceDetail>(`/admin/experiences/${id}`, accessToken);
}

// --- Reservas ---

export interface AdminBookingsFilter {
  q?: string;
  status?: string;
  cruiseId?: string;
}

export function listBookings(accessToken: string, filters: AdminBookingsFilter, page: number) {
  return authFetchJson<PaginatedResult<AdminBookingListItem>>(`/admin/bookings${qs({ ...filters, page })}`, accessToken);
}

export function getBooking(accessToken: string, id: string): Promise<ServiceResult<AdminBookingDetail>> {
  return authFetchJson<AdminBookingDetail>(`/admin/bookings/${id}`, accessToken);
}

export function cancelBooking(accessToken: string, id: string, reason?: string) {
  return authFetchJson(`/admin/bookings/${id}/cancel`, accessToken, { method: 'PATCH', body: JSON.stringify({ reason }) });
}

// --- Pagamentos ---

export interface AdminPaymentsFilter {
  status?: string;
  method?: string;
}

export function listPayments(accessToken: string, filters: AdminPaymentsFilter, page: number) {
  return authFetchJson<PaginatedResult<AdminPaymentListItem>>(`/admin/payments${qs({ ...filters, page })}`, accessToken);
}

export function getPayment(accessToken: string, id: string): Promise<ServiceResult<AdminPaymentDetail>> {
  return authFetchJson<AdminPaymentDetail>(`/admin/payments/${id}`, accessToken);
}

// --- Tickets ---

export interface AdminTicketsFilter {
  q?: string;
  status?: string;
}

export function listTickets(accessToken: string, filters: AdminTicketsFilter, page: number) {
  return authFetchJson<PaginatedResult<AdminTicketListItem>>(`/admin/tickets${qs({ ...filters, page })}`, accessToken);
}

export function getTicket(accessToken: string, id: string): Promise<ServiceResult<AdminTicketDetail>> {
  return authFetchJson<AdminTicketDetail>(`/admin/tickets/${id}`, accessToken);
}

// --- Check-ins ---

export interface AdminCheckInsFilter {
  q?: string;
  staffUserId?: string;
  from?: string;
  to?: string;
}

export function listCheckIns(accessToken: string, filters: AdminCheckInsFilter, page: number) {
  return authFetchJson<PaginatedResult<AdminCheckInListItem>>(`/admin/check-ins${qs({ ...filters, page })}`, accessToken);
}

// --- Cupons ---

export interface AdminCouponsFilter {
  q?: string;
  isActive?: boolean;
  organizerId?: string;
}

export function listCoupons(accessToken: string, filters: AdminCouponsFilter, page: number) {
  return authFetchJson<PaginatedResult<AdminCouponListItem>>(`/admin/coupons${qs({ ...filters, page })}`, accessToken);
}

export function getCoupon(accessToken: string, id: string): Promise<ServiceResult<AdminCouponDetail>> {
  return authFetchJson<AdminCouponDetail>(`/admin/coupons/${id}`, accessToken);
}

export function createCoupon(accessToken: string, input: AdminCouponFormInput): Promise<ServiceResult<AdminCouponDetail>> {
  return authFetchJson<AdminCouponDetail>('/admin/coupons', accessToken, { method: 'POST', body: JSON.stringify(input) });
}

export function updateCoupon(
  accessToken: string,
  id: string,
  input: Partial<AdminCouponFormInput>,
): Promise<ServiceResult<AdminCouponDetail>> {
  return authFetchJson<AdminCouponDetail>(`/admin/coupons/${id}`, accessToken, { method: 'PATCH', body: JSON.stringify(input) });
}

export function deactivateCoupon(accessToken: string, id: string) {
  return authFetchJson(`/admin/coupons/${id}/deactivate`, accessToken, { method: 'PATCH' });
}

export function activateCoupon(accessToken: string, id: string) {
  return authFetchJson(`/admin/coupons/${id}/activate`, accessToken, { method: 'PATCH' });
}

// --- Auditoria ---

export interface AdminAuditLogsFilter {
  action?: string;
  entityType?: string;
  actorUserId?: string;
  from?: string;
  to?: string;
}

export function listAuditLogs(accessToken: string, filters: AdminAuditLogsFilter, page: number) {
  return authFetchJson<PaginatedResult<AdminAuditLog>>(`/admin/audit-logs${qs({ ...filters, page })}`, accessToken);
}

export function getAuditLogFacets(accessToken: string): Promise<ServiceResult<AdminAuditLogFacets>> {
  return authFetchJson<AdminAuditLogFacets>('/admin/audit-logs/facets', accessToken);
}
