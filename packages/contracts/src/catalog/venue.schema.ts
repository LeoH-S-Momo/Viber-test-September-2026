import { z } from "zod";

export const VenueTypeSchema = z.enum(["THEATER", "LOUNGE", "BAR", "POOL", "LEISURE", "OTHER"]);

export const CreateVenueSchema = z.object({
  deckId: z.string().optional(),
  name: z.string().min(2).max(150),
  description: z.string().max(1000).optional(),
  capacity: z.coerce.number().int().positive().optional(),
  type: VenueTypeSchema.default("OTHER"),
});
export type CreateVenueInput = z.infer<typeof CreateVenueSchema>;

export const UpdateVenueSchema = CreateVenueSchema.partial();
export type UpdateVenueInput = z.infer<typeof UpdateVenueSchema>;
