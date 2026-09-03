import { z } from "zod";

export const SetCruiseCabinPricingSchema = z.object({
  cabinCategoryId: z.string(),
  price: z.coerce.number().positive(),
  currency: z.string().length(3).default("BRL"),
  cancellationPolicy: z.string().max(500).optional(),
});
export type SetCruiseCabinPricingInput = z.infer<typeof SetCruiseCabinPricingSchema>;
