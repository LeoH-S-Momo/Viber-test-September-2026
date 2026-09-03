import { z } from "zod";

export const CreateExperienceSchema = z.object({
  cruiseId: z.string(),
  title: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  category: z.string().max(60).optional(),
  price: z.coerce.number().positive().optional(),
  capacity: z.coerce.number().int().positive().optional(),
  isIncluded: z.coerce.boolean().default(false),
});
export type CreateExperienceInput = z.infer<typeof CreateExperienceSchema>;

export const UpdateExperienceSchema = CreateExperienceSchema.omit({ cruiseId: true }).partial();
export type UpdateExperienceInput = z.infer<typeof UpdateExperienceSchema>;
