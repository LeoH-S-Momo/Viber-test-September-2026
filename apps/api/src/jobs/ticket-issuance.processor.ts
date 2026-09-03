import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { TicketsService } from '../modules/tickets/tickets.service';
import { TICKET_ISSUANCE_QUEUE, type TicketIssuanceJobData } from './ticket-issuance-queue';

/**
 * Consome o job agendado por `BookingsService` assim que uma reserva vira
 * CONFIRMED — "emitir o ticket posteriormente" (ver
 * docs/architecture/decisions/0012-checkout-payment-gateway.md): o cliente
 * recebe a confirmacao da reserva sem esperar a emissao dos ingressos, que
 * acontece de forma assincrona logo em seguida (delay 0 — "depois", nao
 * "nunca" nem "junto"). Idempotente (ver
 * TicketsService.issueTicketsForBooking — upsert por hospede), entao um
 * retry do BullMQ apos falha nunca duplica ingresso.
 */
@Processor(TICKET_ISSUANCE_QUEUE)
export class TicketIssuanceProcessor extends WorkerHost {
  private readonly logger = new Logger(TicketIssuanceProcessor.name);

  constructor(private readonly ticketsService: TicketsService) {
    super();
  }

  async process(job: Job<TicketIssuanceJobData>): Promise<void> {
    const count = await this.ticketsService.issueTicketsForBooking(job.data.bookingId);
    this.logger.debug(`Ingressos emitidos para a reserva ${job.data.bookingId}: ${count}.`);
  }
}
