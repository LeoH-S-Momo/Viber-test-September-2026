import { Injectable, Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { BookingsService } from '../modules/bookings/application/bookings.service';
import { CABIN_HOLD_EXPIRATION_QUEUE, type CabinHoldExpirationJobData } from './cabin-hold-queue';

/**
 * Consome o job agendado por `BookingsService.holdCabin` (delay = tempo ate
 * `holdExpiresAt`). So um "acelerador" de UX (a cabine some da tela de
 * quem esta navegando pouco depois do prazo real, sem precisar de um novo
 * hold-attempt pra disparar a expiracao) — NAO e o que garante corretude.
 * Mesmo que este worker nunca rode (fila caida, Redis fora do ar), o
 * proximo `holdCabin` para a mesma cabine expira o hold antigo inline,
 * dentro da propria transacao (ver BookingsRepository.expireStaleHold e
 * ADR-0009). Por isso o processor delega toda a decisao real para
 * `BookingsService.expireHoldIfStillPending`, que reconfirma o estado
 * (pode ja ter sido confirmada/cancelada por outra via) em vez de assumir
 * que o job ainda e valido so por ter disparado.
 */
@Injectable()
@Processor(CABIN_HOLD_EXPIRATION_QUEUE)
export class CabinHoldExpirationProcessor extends WorkerHost {
  private readonly logger = new Logger(CabinHoldExpirationProcessor.name);

  constructor(private readonly bookingsService: BookingsService) {
    super();
  }

  async process(job: Job<CabinHoldExpirationJobData>): Promise<void> {
    await this.bookingsService.expireHoldIfStillPending(job.data.bookingId);
    this.logger.debug(`Hold expirado (ou ja resolvido antes): booking ${job.data.bookingId}`);
  }

  /** So visibilidade — ver o comentario da classe: uma falha aqui nunca compromete corretude (o proximo hold-attempt resolve sozinho), so vale saber que aconteceu. */
  @OnWorkerEvent('failed')
  onJobFailed(job: Job<CabinHoldExpirationJobData>, error: Error): void {
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) return;
    this.logger.warn(`Expiracao de hold esgotou ${maxAttempts} tentativas pra reserva ${job.data.bookingId}: ${error.message}.`);
  }
}
