import { z } from "zod";

export const CreateShipSchema = z.object({
  name: z.string().min(2).max(150),
  imoNumber: z.string().min(4).max(20).optional(),
  description: z.string().max(2000).optional(),
  yearBuilt: z.coerce.number().int().min(1900).max(2100).optional(),
  passengerCapacity: z.coerce.number().int().positive(),
  coverImageUrl: z.string().url().optional(),
});
export type CreateShipInput = z.infer<typeof CreateShipSchema>;

export const UpdateShipSchema = CreateShipSchema.partial();
export type UpdateShipInput = z.infer<typeof UpdateShipSchema>;
