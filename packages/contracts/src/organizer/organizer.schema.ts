import { z } from "zod";
import { PasswordSchema } from "../auth/auth.schema";

export const InviteStaffSchema = z.object({
  email: z.string().email(),
  password: PasswordSchema,
  fullName: z.string().min(2).max(120),
});
export type InviteStaffInput = z.infer<typeof InviteStaffSchema>;

/** Filtro comum do painel do organizador — por cruzeiro e/ou por periodo (ver ADR-0016). */
export const OrganizerDashboardQuerySchema = z.object({
  cruiseId: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type OrganizerDashboardQuery = z.infer<typeof OrganizerDashboardQuerySchema>;

export const OrganizerBookingStatusSchema = z.enum([
  "HELD",
  "PAYMENT_PENDING",
  "CONFIRMED",
  "CANCELLED",
  "EXPIRED",
  "COMPLETED",
  "REFUNDED",
]);

export const OrganizerBookingsQuerySchema = z.object({
  cruiseId: z.string().optional(),
  status: OrganizerBookingStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type OrganizerBookingsQuery = z.infer<typeof OrganizerBookingsQuerySchema>;

export const OrganizerPassengersQuerySchema = z.object({
  cruiseId: z.string().optional(),
  q: z.string().max(150).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type OrganizerPassengersQuery = z.infer<typeof OrganizerPassengersQuerySchema>;

export const OrganizerEventsQuerySchema = z.object({
  cruiseId: z.string().optional(),
});
export type OrganizerEventsQuery = z.infer<typeof OrganizerEventsQuerySchema>;

export const OrganizerExperiencesQuerySchema = z.object({
  cruiseId: z.string().optional(),
});
export type OrganizerExperiencesQuery = z.infer<typeof OrganizerExperiencesQuerySchema>;
