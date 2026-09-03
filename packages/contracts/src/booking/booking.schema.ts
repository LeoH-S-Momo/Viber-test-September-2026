import { z } from "zod";

export const BookingStatusSchema = z.enum([
  "HELD",
  "CONFIRMED",
  "CANCELLED",
  "COMPLETED",
  "REFUNDED",
]);

export const CabinAvailabilitySchema = z.enum(["AVAILABLE", "HELD", "BOOKED", "UNAVAILABLE"]);
export type CabinAvailability = z.infer<typeof CabinAvailabilitySchema>;

export const CancelBookingSchema = z.object({
  reason: z.string().max(500).optional(),
});
export type CancelBookingInput = z.infer<typeof CancelBookingSchema>;
