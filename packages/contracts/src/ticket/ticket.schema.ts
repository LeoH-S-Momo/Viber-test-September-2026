import { z } from "zod";

export const CheckInSchema = z.object({
  location: z.string().max(120).optional(),
});
export type CheckInInput = z.infer<typeof CheckInSchema>;
