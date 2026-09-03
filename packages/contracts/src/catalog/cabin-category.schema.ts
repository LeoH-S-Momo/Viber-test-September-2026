import { z } from "zod";

export const CreateCabinCategorySchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(1000).optional(),
  maxOccupancy: z.coerce.number().int().positive(),
  sizeSqm: z.coerce.number().positive().optional(),
});
export type CreateCabinCategoryInput = z.infer<typeof CreateCabinCategorySchema>;

export const UpdateCabinCategorySchema = CreateCabinCategorySchema.partial();
export type UpdateCabinCategoryInput = z.infer<typeof UpdateCabinCategorySchema>;
