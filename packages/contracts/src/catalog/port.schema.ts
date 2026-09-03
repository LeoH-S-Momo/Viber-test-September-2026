import { z } from "zod";

export const CreatePortSchema = z.object({
  name: z.string().min(2).max(150),
  country: z.string().min(2).max(100),
  unLocode: z.string().min(4).max(10).optional(),
  timezone: z.string().max(60).optional(),
});
export type CreatePortInput = z.infer<typeof CreatePortSchema>;

export const UpdatePortSchema = CreatePortSchema.partial();
export type UpdatePortInput = z.infer<typeof UpdatePortSchema>;
