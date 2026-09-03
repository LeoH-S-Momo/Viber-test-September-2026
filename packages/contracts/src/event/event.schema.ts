import { z } from "zod";

export const CreateEventSchema = z.object({
  cruiseId: z.string(),
  venueId: z.string(),
  artistId: z.string().optional(),
  title: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  category: z
    .enum(["SHOW", "WORKSHOP", "PARTY", "LECTURE", "MEET_AND_GREET", "OTHER"])
    .default("OTHER"),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  capacity: z.coerce.number().int().positive().optional(),
  isIncluded: z.coerce.boolean().default(true),
  price: z.coerce.number().positive().optional(),
});
export type CreateEventInput = z.infer<typeof CreateEventSchema>;

export const UpdateEventSchema = CreateEventSchema.omit({ cruiseId: true }).partial();
export type UpdateEventInput = z.infer<typeof UpdateEventSchema>;

export const EventQuerySchema = z.object({
  cruiseId: z.string().optional(),
  category: z
    .enum(["SHOW", "WORKSHOP", "PARTY", "LECTURE", "MEET_AND_GREET", "OTHER"])
    .optional(),
});
export type EventQuery = z.infer<typeof EventQuerySchema>;
