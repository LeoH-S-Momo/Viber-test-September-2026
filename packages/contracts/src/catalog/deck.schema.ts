import { z } from "zod";

export const CreateDeckSchema = z.object({
  number: z.coerce.number().int(),
  name: z.string().max(150).optional(),
  description: z.string().max(1000).optional(),
});
export type CreateDeckInput = z.infer<typeof CreateDeckSchema>;

export const UpdateDeckSchema = CreateDeckSchema.partial();
export type UpdateDeckInput = z.infer<typeof UpdateDeckSchema>;
