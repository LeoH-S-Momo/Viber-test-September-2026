import { Injectable, Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { AuditLogService } from '../audit/audit-log.service';
import { TicketsService } from '../modules/tickets/application/tickets.service';
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
 *
 * Retry/backoff configurados em `BookingsModule` (ver ADR-0020) — sem eles,
 * uma falha aqui (Redis/Postgres com blip no momento errado) deixava uma
 * reserva PAGA sem ticket pra sempre, descoberta so vasculhando log manualmente.
 */
@Injectable()
@Processor(TICKET_ISSUANCE_QUEUE)
export class TicketIssuanceProcessor extends WorkerHost {
  private readonly logger = new Logger(TicketIssuanceProcessor.name);

  constructor(
    private readonly ticketsService: TicketsService,
    private readonly auditLog: AuditLogService,
  ) {
    super();
  }

  async process(job: Job<TicketIssuanceJobData>): Promise<void> {
    const count = await this.ticketsService.issueTicketsForBooking(job.data.bookingId);
    this.logger.debug(`Ingressos emitidos para a reserva ${job.data.bookingId}: ${count}.`);
  }

  /** So visibilidade (log + auditoria) apos a ULTIMA tentativa — nunca esconde uma reserva paga sem ticket num log que ninguem le. */
  @OnWorkerEvent('failed')
  async onJobFailed(job: Job<TicketIssuanceJobData>, error: Error): Promise<void> {
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) return;

    this.logger.error(
      `Emissao de ticket esgotou ${maxAttempts} tentativas pra reserva ${job.data.bookingId}: ${error.message}. ` +
        'Reserva PAGA sem ticket — requer intervencao manual (reprocessar via BullMQ ou emitir na mao).',
    );
    await this.auditLog.record({
      actorUserId: null,
      action: 'ticket.issuance_failed',
      entityType: 'Booking',
      entityId: job.data.bookingId,
      metadata: { attempts: job.attemptsMade, error: error.message },
    });
  }
}
