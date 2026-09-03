import { z } from "zod";

export const CabinStatusSchema = z.enum(["ACTIVE", "MAINTENANCE", "RETIRED"]);

export const CreateCabinSchema = z.object({
  cabinCategoryId: z.string(),
  code: z.string().min(1).max(20),
  status: CabinStatusSchema.default("ACTIVE"),
});
export type CreateCabinInput = z.infer<typeof CreateCabinSchema>;

export const UpdateCabinSchema = z.object({
  cabinCategoryId: z.string().optional(),
  status: CabinStatusSchema.optional(),
});
export type UpdateCabinInput = z.infer<typeof UpdateCabinSchema>;
