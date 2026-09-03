/**
 * Nome da fila BullMQ + nome do job de expiracao de hold de cabine (ver
 * ADR-0009). Compartilhado entre bookings.module.ts (registra a fila),
 * bookings.service.ts (enfileira/remove o job) e o processor abaixo
 * (consome o job) — evita strings magicas duplicadas entre os tres.
 */
export const CABIN_HOLD_EXPIRATION_QUEUE = 'cabin-hold-expiration';
export const CABIN_HOLD_EXPIRATION_JOB = 'expire-hold';

export interface CabinHoldExpirationJobData {
  bookingId: string;
}
