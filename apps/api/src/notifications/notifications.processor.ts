import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { Queue } from 'bullmq';
import { AuditLogService } from '../audit/audit-log.service';
import { MailerService } from './mailer.service';
import { NotificationsService } from './notifications.service';
import {
  BOARDING_REMINDER_JOB,
  NOTIFICATIONS_DEAD_LETTER_QUEUE,
  NOTIFICATIONS_QUEUE,
  SEND_NOTIFICATION_EMAIL_JOB,
  type BoardingReminderJobData,
  type DeadLetterJobData,
  type SendNotificationEmailJobData,
} from './notifications-queue';

/**
 * Worker unico pra fila `notifications` (ver ADR-0019), despachando por
 * `job.name` — o mesmo padrao de "uma fila, mais de um tipo de job" que o
 * BullMQ recomenda em vez de uma fila por job trivial. Cobre os dois casos
 * pedidos explicitamente: retry (`attempts`/`backoff`, configurados no
 * `registerQueue` do `NotificationsModule`) e idempotencia (o `SEND_...`
 * job so reenvia se `deliveryStatus` ainda nao for `SENT` — protege contra
 * um retry rodar DEPOIS de um envio que teve sucesso mas cujo `markSent`
 * falhou antes de persistir).
 */
@Injectable()
@Processor(NOTIFICATIONS_QUEUE)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly mailer: MailerService,
    private readonly auditLog: AuditLogService,
    @InjectQueue(NOTIFICATIONS_DEAD_LETTER_QUEUE) private readonly deadLetterQueue: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case SEND_NOTIFICATION_EMAIL_JOB:
        return this.sendNotificationEmail(job as Job<SendNotificationEmailJobData>);
      case BOARDING_REMINDER_JOB:
        return this.processBoardingReminder(job as Job<BoardingReminderJobData>);
      default:
        // Nunca deveria acontecer (so este processor enfileira nesta fila) — nao falha
        // silenciosamente, deixa o job cair pro estado failed como qualquer outro erro.
        throw new Error(`Job desconhecido na fila ${NOTIFICATIONS_QUEUE}: "${job.name}".`);
    }
  }

  private async sendNotificationEmail(job: Job<SendNotificationEmailJobData>): Promise<void> {
    const { notificationId } = job.data;
    const notification = await this.notifications.findForDelivery(notificationId);
    if (!notification) {
      // Notificacao sumiu (nao deveria — nunca ha delete de Notification hoje) — nao ha o que
      // reenviar, e insistir so gastaria as tentativas do BullMQ a toa.
      this.logger.warn(`Notificacao ${notificationId} nao encontrada — job descartado.`);
      return;
    }

    // Idempotencia "de verdade": mesmo que este job rode de novo (retry apos falha em marcar
    // como enviado, replay manual, o que for), nunca manda o mesmo e-mail duas vezes.
    if (notification.deliveryStatus === 'SENT') {
      this.logger.debug(`Notificacao ${notificationId} ja enviada — job idempotente, nada a fazer.`);
      return;
    }

    try {
      await this.mailer.sendMail({
        to: notification.user.email,
        subject: notification.title,
        text: notification.message,
        html: notification.htmlBody ?? notification.message,
      });
      await this.notifications.markSent(notificationId);
    } catch (error) {
      // Nao marca FAILED aqui ainda — so quando as tentativas do BullMQ esgotarem (ver
      // handleFailedJob/@OnWorkerEvent('failed') abaixo). Uma falha de tentativa 2 de 5 e
      // transitoria por definicao; so a ULTIMA falha e definitiva.
      this.logger.warn(
        `Falha ao enviar notificacao ${notificationId} (tentativa ${job.attemptsMade + 1}/${job.opts.attempts ?? 1}): ${(error as Error).message}`,
      );
      throw error; // deixa o BullMQ agendar o proximo retry (backoff exponencial, ver NotificationsModule)
    }
  }

  private async processBoardingReminder(job: Job<BoardingReminderJobData>): Promise<void> {
    await this.notifications.notifyBoardingReminderIfStillConfirmed(job.data.bookingId);
  }

  /**
   * Dead-letter (ver ADR-0019): quando as tentativas se esgotam de vez, o
   * job cai aqui — persistido na fila `notifications-dead-letter` (visivel
   * via Redis/BullMQ pra inspecao manual, nao so um log que rola pra fora
   * da tela) + a notificacao marcada FAILED no banco + um AuditLog (`quem`
   * seria "o sistema", `o que` foi a falha, `quando`, `qual recurso`).
   */
  @OnWorkerEvent('failed')
  async onJobFailed(job: Job, error: Error): Promise<void> {
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) {
      return; // ainda vai tentar de novo — so a falha final vira dead-letter.
    }

    this.logger.error(`Job "${job.name}" (${job.id}) esgotou as ${maxAttempts} tentativas: ${error.message}`);

    if (job.name === SEND_NOTIFICATION_EMAIL_JOB) {
      const { notificationId } = job.data as SendNotificationEmailJobData;
      await this.notifications.markFailed(notificationId, error.message);
      await this.auditLog.record({
        actorUserId: null,
        action: 'notification.email_dead_lettered',
        entityType: 'Notification',
        entityId: notificationId,
        metadata: { attempts: job.attemptsMade, error: error.message },
      });
    }

    const deadLetterData: DeadLetterJobData = {
      originalQueue: NOTIFICATIONS_QUEUE,
      originalJobName: job.name,
      originalJobId: job.id ?? 'unknown',
      failedReason: error.message,
      attemptsMade: job.attemptsMade,
      data: job.data,
    };
    await this.deadLetterQueue.add('dead-letter', deadLetterData);
  }
}
