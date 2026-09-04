import { z } from "zod";

/**
 * Modulo de check-in (ver docs/architecture/decisions/0013-digital-ticket-checkin.md):
 * substitui o antigo `CheckInSchema` (por id de ticket) por um fluxo em
 * duas etapas por CODIGO — "escanear/informar codigo" — que e como o staff
 * de fato opera (nunca sabe o id interno de um ticket).
 */
export const LookupCheckInSchema = z.object({
  code: z.string().min(1).max(200),
});
export type LookupCheckInInput = z.infer<typeof LookupCheckInSchema>;

export const ConfirmCheckInSchema = z.object({
  code: z.string().min(1).max(200),
  location: z.string().max(120).optional(),
});
export type ConfirmCheckInInput = z.infer<typeof ConfirmCheckInSchema>;

/** Os quatro estados possiveis de uma tentativa de check-in — espelha CheckInPolicy.CheckInOutcome (fonte de verdade no backend). */
export const CheckInOutcomeSchema = z.enum(["NOT_CHECKED_IN", "CHECKED_IN", "INVALID", "ALREADY_USED"]);
export type CheckInOutcome = z.infer<typeof CheckInOutcomeSchema>;
