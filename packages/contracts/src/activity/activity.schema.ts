import { z } from "zod";

/**
 * Reserva de atividade de bordo (evento ou restaurante) — ver
 * docs/architecture/decisions/0014-onboard-activity-reservations.md.
 * `partySize` sempre exigido explicitamente (nunca inferido do numero de
 * hospedes da cabine) — a viagem pode querer levar so parte do grupo a um
 * evento.
 */
export const ReserveEventSchema = z.object({
  partySize: z.coerce.number().int().min(1).max(20),
});
export type ReserveEventInput = z.infer<typeof ReserveEventSchema>;

export const ReserveDiningSchema = z.object({
  diningSlotId: z.string(),
  partySize: z.coerce.number().int().min(1).max(20),
  /** So a data (YYYY-MM-DD) — o horario vem do DiningSlot escolhido. */
  reservationDate: z.coerce.date(),
});
export type ReserveDiningInput = z.infer<typeof ReserveDiningSchema>;

/**
 * GET .../dining-slots/:id/availability?date=... — `z.coerce.date()` rejeita uma string
 * nao-parseavel com um 400 limpo antes de chegar no service; sem isto, `date` cru vinha da
 * query string sem validacao nenhuma e um valor invalido virava uma Data invalida que so
 * quebrava mais tarde, dentro da query ao Prisma, como um 500 generico.
 */
export const DiningAvailabilityQuerySchema = z.object({
  date: z.coerce.date(),
});
export type DiningAvailabilityQuery = z.infer<typeof DiningAvailabilityQuerySchema>;

export const CreateDiningSlotSchema = z.object({
  label: z.string().min(2).max(80),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  capacity: z.coerce.number().int().positive(),
});
export type CreateDiningSlotInput = z.infer<typeof CreateDiningSlotSchema>;

export const UpdateDiningSlotSchema = CreateDiningSlotSchema.partial();
export type UpdateDiningSlotInput = z.infer<typeof UpdateDiningSlotSchema>;
