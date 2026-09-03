import { z } from "zod";

export const CreateItineraryStopSchema = z.object({
  portId: z.string().optional(), // omitido = dia no mar
  dayNumber: z.coerce.number().int().positive(),
  arrivalAt: z.coerce.date().optional(),
  departureAt: z.coerce.date().optional(),
  isEmbarkation: z.coerce.boolean().default(false),
  isDisembarkation: z.coerce.boolean().default(false),
});
export type CreateItineraryStopInput = z.infer<typeof CreateItineraryStopSchema>;

export const UpdateItineraryStopSchema = CreateItineraryStopSchema.partial();
export type UpdateItineraryStopInput = z.infer<typeof UpdateItineraryStopSchema>;
