import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { NOTIFICATIONS_DEAD_LETTER_QUEUE, type DeadLetterJobData } from './notifications-queue';

/**
 * Consumidor da fila de dead-letter (ver ADR-0019 e NotificationsProcessor.onJobFailed). O
 * trabalho de verdade (marcar a Notification como FAILED, gravar o AuditLog) ja aconteceu no
 * momento em que o job caiu aqui — este processor existe pra dar VISIBILIDADE observavel (um
 * `job` de verdade no Redis/BullMQ, inspecionavel por uma ferramenta tipo Bull Board, nao so uma
 * linha de log que rola pra fora da tela) e seria o lugar natural pra plugar um alerta real
 * (Slack, PagerDuty) numa versao de producao. Nunca falha nem reenfileira — dead-letter e
 * terminal por definicao.
 */
@Injectable()
@Processor(NOTIFICATIONS_DEAD_LETTER_QUEUE)
export class NotificationsDeadLetterProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsDeadLetterProcessor.name);

  async process(job: Job<DeadLetterJobData>): Promise<void> {
    const { originalQueue, originalJobName, originalJobId, failedReason, attemptsMade } = job.data;
    this.logger.error(
      `[DEAD LETTER] "${originalJobName}" (${originalJobId}) da fila "${originalQueue}" falhou definitivamente ` +
        `apos ${attemptsMade} tentativas: ${failedReason}`,
    );
  }
}
