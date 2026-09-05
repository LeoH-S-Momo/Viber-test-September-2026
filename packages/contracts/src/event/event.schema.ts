import { z } from "zod";

const EventFieldsSchema = z.object({
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

/**
 * Ao contrario de DiningSlot.startTime/endTime (que deliberadamente permite "end < start" pra
 * representar um horario que atravessa a meia-noite — ver dining-schedule.util.ts), um Event
 * nao tem essa semantica de recorrencia: nao ha razao pra um show "terminar antes de comecar".
 * Faltava desde sempre (nem no create) — achado na revisao geral de 2026-09-05.
 */
export const CreateEventSchema = EventFieldsSchema.refine((data) => data.endAt > data.startAt, {
  message: "endAt precisa ser depois de startAt.",
  path: ["endAt"],
});
export type CreateEventInput = z.infer<typeof CreateEventSchema>;

/**
 * `.partial()` antes do `.refine()` (nao depois) — mesma limitacao de UpdateCruiseSchema/
 * UpdateCouponSchema: um PATCH parcial (so `startAt` OU so `endAt`) nao tem como o Zod comparar
 * contra o valor JA salvo do campo que faltou no body, entao o refine aqui so pega quando os
 * DOIS vem juntos; o backstop contra o valor existente mora em EventsService.update.
 */
export const UpdateEventSchema = EventFieldsSchema.omit({ cruiseId: true })
  .partial()
  .refine((data) => !data.startAt || !data.endAt || data.endAt > data.startAt, {
    message: "endAt precisa ser depois de startAt.",
    path: ["endAt"],
  });
export type UpdateEventInput = z.infer<typeof UpdateEventSchema>;

export const EventQuerySchema = z.object({
  cruiseId: z.string().optional(),
  category: z
    .enum(["SHOW", "WORKSHOP", "PARTY", "LECTURE", "MEET_AND_GREET", "OTHER"])
    .optional(),
});
export type EventQuery = z.infer<typeof EventQuerySchema>;
