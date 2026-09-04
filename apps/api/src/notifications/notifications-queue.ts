/**
 * Fila BullMQ de notificacoes + a fila de dead-letter (ver ADR-0019). Mesma
 * convencao de nomes compartilhados de src/jobs/*-queue.ts — usados por
 * `notifications.module.ts` (registra as filas), `notifications.service.ts`
 * (enfileira) e `notifications.processor.ts` (consome).
 */
export const NOTIFICATIONS_QUEUE = 'notifications';
export const NOTIFICATIONS_DEAD_LETTER_QUEUE = 'notifications-dead-letter';

/** Envia o e-mail de UMA notificacao ja persistida (ver NotificationsService.notify). */
export const SEND_NOTIFICATION_EMAIL_JOB = 'send-notification-email';
/**
 * Agendado (delay = ate `BOARDING_REMINDER_HOURS_BEFORE` antes do embarque) quando uma reserva
 * confirma — reconfirma que a reserva ainda esta CONFIRMED antes de gerar a notificacao de
 * verdade (mesmo principio defensivo de CabinHoldExpirationProcessor).
 */
export const BOARDING_REMINDER_JOB = 'boarding-reminder';

export interface SendNotificationEmailJobData {
  notificationId: string;
}

export interface BoardingReminderJobData {
  bookingId: string;
}

/** Job que chegou na fila de dead-letter — so o necessario pra diagnostico (ver NotificationsDeadLetterProcessor). */
export interface DeadLetterJobData {
  originalQueue: string;
  originalJobName: string;
  originalJobId: string;
  failedReason: string;
  attemptsMade: number;
  data: unknown;
}
