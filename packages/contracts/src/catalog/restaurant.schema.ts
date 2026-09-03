import { z } from "zod";

export const CreateRestaurantSchema = z.object({
  deckId: z.string().optional(),
  name: z.string().min(2).max(150),
  description: z.string().max(1000).optional(),
  cuisineType: z.string().max(100).optional(),
  isIncluded: z.coerce.boolean().default(true),
});
export type CreateRestaurantInput = z.infer<typeof CreateRestaurantSchema>;

export const UpdateRestaurantSchema = CreateRestaurantSchema.partial();
export type UpdateRestaurantInput = z.infer<typeof UpdateRestaurantSchema>;
