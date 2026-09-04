import { z } from "zod";

/** Base comum a toda listagem do painel admin — busca + paginacao (ver ADR-0018). */
const AdminListBaseSchema = z.object({
  q: z.string().max(150).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// --- Usuarios ---
export const UserStatusSchema = z.enum(["ACTIVE", "SUSPENDED", "PENDING_VERIFICATION"]);
export const AdminUsersQuerySchema = AdminListBaseSchema.extend({
  status: UserStatusSchema.optional(),
  role: z.enum(["PASSENGER", "ORGANIZER_ADMIN", "ORGANIZER_STAFF", "PLATFORM_ADMIN"]).optional(),
});
export type AdminUsersQuery = z.infer<typeof AdminUsersQuerySchema>;

// --- Organizadores ---
export const OrganizerStatusSchema = z.enum(["PENDING", "APPROVED", "SUSPENDED", "REJECTED"]);
export const AdminOrganizersQuerySchema = AdminListBaseSchema.extend({
  status: OrganizerStatusSchema.optional(),
});
export type AdminOrganizersQuery = z.infer<typeof AdminOrganizersQuerySchema>;

// --- Cruzeiros ---
export const AdminCruiseStatusSchema = z.enum(["DRAFT", "PUBLISHED", "CANCELLED", "COMPLETED"]);
export const AdminCruisesQuerySchema = AdminListBaseSchema.extend({
  status: AdminCruiseStatusSchema.optional(),
  organizerId: z.string().optional(),
});
export type AdminCruisesQuery = z.infer<typeof AdminCruisesQuerySchema>;

// --- Navios ---
export const AdminShipsQuerySchema = AdminListBaseSchema.extend({
  organizerId: z.string().optional(),
});
export type AdminShipsQuery = z.infer<typeof AdminShipsQuerySchema>;

// --- Cabines ---
export const AdminCabinStatusSchema = z.enum(["ACTIVE", "MAINTENANCE", "RETIRED"]);
export const AdminCabinsQuerySchema = AdminListBaseSchema.extend({
  shipId: z.string().optional(),
  status: AdminCabinStatusSchema.optional(),
});
export type AdminCabinsQuery = z.infer<typeof AdminCabinsQuerySchema>;

// --- Reservas ---
export const AdminBookingStatusSchema = z.enum([
  "HELD",
  "PAYMENT_PENDING",
  "CONFIRMED",
  "CANCELLED",
  "EXPIRED",
  "COMPLETED",
  "REFUNDED",
]);
export const AdminBookingsQuerySchema = AdminListBaseSchema.extend({
  status: AdminBookingStatusSchema.optional(),
  cruiseId: z.string().optional(),
});
export type AdminBookingsQuery = z.infer<typeof AdminBookingsQuerySchema>;

// --- Pagamentos ---
export const AdminPaymentStatusSchema = z.enum(["PENDING", "APPROVED", "DECLINED", "REFUNDED"]);
export const AdminPaymentMethodSchema = z.enum(["CREDIT_CARD", "PIX", "BOLETO"]);
export const AdminPaymentsQuerySchema = AdminListBaseSchema.extend({
  status: AdminPaymentStatusSchema.optional(),
  method: AdminPaymentMethodSchema.optional(),
});
export type AdminPaymentsQuery = z.infer<typeof AdminPaymentsQuerySchema>;

// --- Eventos ---
export const AdminEventsQuerySchema = AdminListBaseSchema.extend({
  cruiseId: z.string().optional(),
});
export type AdminEventsQuery = z.infer<typeof AdminEventsQuerySchema>;

// --- Restaurantes ---
export const AdminRestaurantsQuerySchema = AdminListBaseSchema.extend({
  shipId: z.string().optional(),
});
export type AdminRestaurantsQuery = z.infer<typeof AdminRestaurantsQuerySchema>;

// --- Experiencias ---
export const AdminExperiencesQuerySchema = AdminListBaseSchema.extend({
  cruiseId: z.string().optional(),
});
export type AdminExperiencesQuery = z.infer<typeof AdminExperiencesQuerySchema>;

// --- Cupons ---
// `z.coerce.boolean()` usaria `Boolean(str)`, que e `true` para QUALQUER
// string nao-vazia (inclusive a string "false") — errado pra um filtro de
// query string. Aceita soh "true"/"false" e converte explicitamente.
const QueryBooleanSchema = z.enum(['true', 'false']).transform((v) => v === 'true');
export const AdminCouponsQuerySchema = AdminListBaseSchema.extend({
  isActive: QueryBooleanSchema.optional(),
  organizerId: z.string().optional(),
});
export type AdminCouponsQuery = z.infer<typeof AdminCouponsQuerySchema>;

const CouponFieldsSchema = z.object({
  code: z
    .string()
    .min(3)
    .max(40)
    .transform((v) => v.toUpperCase()),
  organizerId: z.string().optional(),
  discountType: z.enum(["PERCENTAGE", "FIXED_AMOUNT"]),
  discountValue: z.coerce.number().positive(),
  minPurchaseAmount: z.coerce.number().nonnegative().optional(),
  maxUses: z.coerce.number().int().positive().optional(),
  maxUsesPerUser: z.coerce.number().int().positive().optional(),
  validFrom: z.coerce.date(),
  validUntil: z.coerce.date(),
  isActive: z.coerce.boolean().default(true),
  applicableCruiseIds: z.array(z.string()).default([]),
});

export const CreateCouponSchema = CouponFieldsSchema.refine((data) => data.validUntil > data.validFrom, {
  message: "validUntil precisa ser depois de validFrom.",
  path: ["validUntil"],
});
export type CreateCouponInput = z.infer<typeof CreateCouponSchema>;

export const UpdateCouponSchema = CouponFieldsSchema.omit({ code: true }).partial();
export type UpdateCouponInput = z.infer<typeof UpdateCouponSchema>;

// --- Tickets ---
export const AdminTicketStatusSchema = z.enum(["ISSUED", "CHECKED_IN", "CANCELLED"]);
export const AdminTicketsQuerySchema = AdminListBaseSchema.extend({
  status: AdminTicketStatusSchema.optional(),
});
export type AdminTicketsQuery = z.infer<typeof AdminTicketsQuerySchema>;

// --- Check-ins ---
export const AdminCheckInsQuerySchema = AdminListBaseSchema.extend({
  staffUserId: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type AdminCheckInsQuery = z.infer<typeof AdminCheckInsQuerySchema>;

// --- Auditoria ---
export const AdminAuditLogsQuerySchema = z.object({
  action: z.string().max(80).optional(),
  entityType: z.string().max(80).optional(),
  actorUserId: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type AdminAuditLogsQuery = z.infer<typeof AdminAuditLogsQuerySchema>;
