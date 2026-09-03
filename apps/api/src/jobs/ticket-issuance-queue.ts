/**
 * Nome da fila BullMQ + nome do job de emissao de ingresso digital, disparado
 * depois que uma reserva e CONFIRMED (ver BookingsService.checkout/
 * confirmPayment e docs/architecture/decisions/0012-checkout-payment-gateway.md
 * — "emitir o ticket posteriormente"). Mesmo padrao de
 * jobs/cabin-hold-queue.ts: nomes compartilhados entre quem enfileira
 * (BookingsService), quem registra a fila (BookingsModule) e quem consome
 * (TicketIssuanceProcessor).
 */
export const TICKET_ISSUANCE_QUEUE = 'ticket-issuance';
export const TICKET_ISSUANCE_JOB = 'issue-tickets';

export interface TicketIssuanceJobData {
  bookingId: string;
}
