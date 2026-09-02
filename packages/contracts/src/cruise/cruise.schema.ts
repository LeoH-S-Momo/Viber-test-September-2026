import { z } from "zod";

export const CreateCruiseSchema = z.object({
  shipId: z.string(),
  title: z.string().min(3).max(200),
  theme: z.string().min(2).max(60),
  description: z.string().max(2000).optional(),
  embarkationDate: z.coerce.date(),
  disembarkationDate: z.coerce.date(),
  embarkationPortId: z.string(),
  disembarkationPortId: z.string(),
});
export type CreateCruiseInput = z.infer<typeof CreateCruiseSchema>;

export const UpdateCruiseSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "CANCELLED", "COMPLETED"]).optional(),
});
export type UpdateCruiseInput = z.infer<typeof UpdateCruiseSchema>;
