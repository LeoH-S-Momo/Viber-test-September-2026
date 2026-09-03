import { z } from "zod";

export const BookingStatusSchema = z.enum([
  "HELD",
  "PAYMENT_PENDING",
  "CONFIRMED",
  "CANCELLED",
  "EXPIRED",
  "COMPLETED",
  "REFUNDED",
]);

export const CabinAvailabilitySchema = z.enum(["AVAILABLE", "HELD", "BOOKED", "UNAVAILABLE"]);
export type CabinAvailability = z.infer<typeof CabinAvailabilitySchema>;

export const CancelBookingSchema = z.object({
  reason: z.string().max(500).optional(),
});
export type CancelBookingInput = z.infer<typeof CancelBookingSchema>;

export const DocumentTypeSchema = z.enum(["PASSPORT", "NATIONAL_ID"]);

export const BookingGuestInputSchema = z.object({
  fullName: z.string().min(2).max(150),
  documentType: DocumentTypeSchema,
  documentNumber: z.string().min(3).max(30),
  birthDate: z.coerce.date().optional(),
  isPrimary: z.boolean().default(false),
});
export type BookingGuestInput = z.infer<typeof BookingGuestInputSchema>;

/**
 * "Informa passageiros" + "seleciona adicionais" do fluxo de reserva (ver
 * ADR-0010) — PUT idempotente: substitui hospedes/adicionais por completo a
 * cada chamada, nao incrementa. `couponCode` e opcional e reavaliado do
 * zero a cada chamada (nunca fica "preso" de uma tentativa anterior).
 */
export const UpdateBookingDetailsSchema = z.object({
  guests: z.array(BookingGuestInputSchema).min(1).max(10),
  experienceIds: z.array(z.string()).default([]),
  couponCode: z.string().max(50).optional(),
});
export type UpdateBookingDetailsInput = z.infer<typeof UpdateBookingDetailsSchema>;

export const PaymentMethodSchema = z.enum(["CREDIT_CARD", "PIX", "BOLETO"]);

export const CheckoutBookingSchema = z.object({
  paymentMethod: PaymentMethodSchema,
});
export type CheckoutBookingInput = z.infer<typeof CheckoutBookingSchema>;
