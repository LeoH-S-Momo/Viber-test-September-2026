import { z } from "zod";

export const CreateArtistSchema = z.object({
  name: z.string().min(2).max(150),
  bio: z.string().max(2000).optional(),
  imageUrl: z.string().url().optional(),
});
export type CreateArtistInput = z.infer<typeof CreateArtistSchema>;

export const UpdateArtistSchema = CreateArtistSchema.partial();
export type UpdateArtistInput = z.infer<typeof UpdateArtistSchema>;
