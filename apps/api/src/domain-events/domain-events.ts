/**
 * Eventos de dominio/aplicacao do SeaPass (ver
 * docs/architecture/decisions/0019-events-and-notifications.md). Emitidos
 * via `EventEmitter2` (in-process, sincrono) DEPOIS que a transacao que
 * mudou o estado ja fez commit — nunca de dentro de um `prisma.$transaction`
 * (evita notificar sobre algo que pode nao ter sido persistido de verdade).
 *
 * Um evento nao promete que alguem "faz algo com ele" — `NotificationsModule`
 * escuta o subconjunto que vira notificacao (ver notifications/), mas o
 * emissor (BookingsService, TicketsService, etc.) nunca sabe disso: so
 * declara "isto aconteceu". Nem todo evento tem um listener hoje
 * (BOOKING_CREATED e CHECKIN_COMPLETED nao geram notificacao agora) — sao
 * emitidos mesmo assim, porque sao fatos de dominio uteis (auditoria,
 * analytics, um listener futuro), nao "criados sob demanda" pro listener que
 * existe hoje.
 */
export const DomainEvent = {
  BOOKING_CREATED: 'booking.created',
  BOOKING_CONFIRMED: 'booking.confirmed',
  BOOKING_CANCELLED: 'booking.cancelled',
  PAYMENT_APPROVED: 'payment.approved',
  PAYMENT_FAILED: 'payment.failed',
  TICKET_GENERATED: 'ticket.generated',
  CHECKIN_COMPLETED: 'checkin.completed',
  EVENT_BOOKED: 'event.booked',
  /** Nao estava na lista de exemplos do pedido, mas e o que torna "alteracao de evento" (uma das notificacoes pedidas) possivel — ver ADR-0019. */
  EVENT_UPDATED: 'event.updated',
} as const;

export type DomainEventName = (typeof DomainEvent)[keyof typeof DomainEvent];

/**
 * Payloads deliberadamente minimos (so IDs) — o listener sempre relê o
 * estado atual do Prisma na hora de agir, nunca confia em dados carregados
 * no payload do evento (mesmo principio de `TicketIssuanceProcessor`: menos
 * risco de dado desatualizado entre o emit e o listener rodar).
 */
export interface BookingCreatedPayload {
  bookingId: string;
}

export interface BookingConfirmedPayload {
  bookingId: string;
}

export interface BookingCancelledPayload {
  bookingId: string;
  reason: string | null;
  cancelledBy: 'PASSENGER' | 'ADMIN';
}

export interface PaymentApprovedPayload {
  paymentId: string;
  bookingId: string;
}

export interface PaymentFailedPayload {
  paymentId: string;
  bookingId: string;
  reason: string | null;
}

export interface TicketGeneratedPayload {
  bookingId: string;
  ticketCount: number;
}

export interface CheckInCompletedPayload {
  ticketId: string;
  staffUserId: string;
}

export interface EventBookedPayload {
  bookingId: string;
  eventId: string;
}

export interface EventUpdatedPayload {
  eventId: string;
  /** Nomes dos campos que mudaram — o listener so notifica quando algo que importa pro passageiro mudou (ver EventsService.update). */
  changedFields: string[];
}
