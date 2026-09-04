// @nestjs/bullmq ships ESM-only JS em node_modules, que ts-jest (unit config, so transforma .ts)
// nao consegue parsear — mesmo motivo/mesma solucao de bookings.service.spec.ts: este teste so
// precisa das assinaturas dos decorators (nunca passam pelo container de DI do Nest aqui, o
// processor e instanciado com `new` e os metodos chamados direto) e de `WorkerHost` como uma
// classe-base generica pra `extends` funcionar.
jest.mock('@nestjs/bullmq', () => ({
  InjectQueue:
    () =>
    (): void => {
      /* no-op */
    },
  Processor:
    () =>
    (target: unknown): unknown =>
      target,
  OnWorkerEvent:
    () =>
    (): void => {
      /* no-op */
    },
  WorkerHost: class {},
}));

import { NotificationsProcessor } from '../../src/notifications/notifications.processor';
import { SEND_NOTIFICATION_EMAIL_JOB, BOARDING_REMINDER_JOB } from '../../src/notifications/notifications-queue';

function buildProcessor() {
  const notifications = {
    findForDelivery: jest.fn(),
    markSent: jest.fn(),
    markFailed: jest.fn(),
    notifyBoardingReminderIfStillConfirmed: jest.fn(),
  };
  const mailer = { sendMail: jest.fn() };
  const auditLog = { record: jest.fn() };
  const deadLetterQueue = { add: jest.fn() };

  const processor = new NotificationsProcessor(notifications as never, mailer as never, auditLog as never, deadLetterQueue as never);
  return { processor, notifications, mailer, auditLog, deadLetterQueue };
}

function buildJob(overrides: Partial<{ name: string; id: string; data: unknown; attemptsMade: number; attempts: number }> = {}) {
  return {
    name: overrides.name ?? SEND_NOTIFICATION_EMAIL_JOB,
    id: overrides.id ?? 'job-1',
    data: overrides.data ?? { notificationId: 'notif-1' },
    attemptsMade: overrides.attemptsMade ?? 0,
    opts: { attempts: overrides.attempts ?? 5 },
  } as never;
}

const NOTIFICATION = {
  id: 'notif-1',
  title: 'Assunto',
  message: 'Corpo em texto',
  htmlBody: '<p>Corpo</p>',
  deliveryStatus: 'PENDING',
  user: { email: 'passageiro@example.com' },
};

describe('NotificationsProcessor', () => {
  describe('send-notification-email', () => {
    it('envia o e-mail e marca a notificacao como SENT', async () => {
      const { processor, notifications, mailer } = buildProcessor();
      notifications.findForDelivery.mockResolvedValue(NOTIFICATION);

      await processor.process(buildJob());

      expect(mailer.sendMail).toHaveBeenCalledWith({
        to: 'passageiro@example.com',
        subject: 'Assunto',
        text: 'Corpo em texto',
        html: '<p>Corpo</p>',
      });
      expect(notifications.markSent).toHaveBeenCalledWith('notif-1');
    });

    it('idempotencia: nao reenvia (nem chama o mailer) se ja esta SENT', async () => {
      const { processor, notifications, mailer } = buildProcessor();
      notifications.findForDelivery.mockResolvedValue({ ...NOTIFICATION, deliveryStatus: 'SENT' });

      await processor.process(buildJob());

      expect(mailer.sendMail).not.toHaveBeenCalled();
      expect(notifications.markSent).not.toHaveBeenCalled();
    });

    it('sem a notificacao (sumiu do banco): descarta o job sem tentar enviar nem marcar', async () => {
      const { processor, notifications, mailer } = buildProcessor();
      notifications.findForDelivery.mockResolvedValue(null);

      await processor.process(buildJob());

      expect(mailer.sendMail).not.toHaveBeenCalled();
      expect(notifications.markSent).not.toHaveBeenCalled();
    });

    it('falha do SMTP: repropaga o erro (pro BullMQ reagendar o retry) sem marcar FAILED ainda', async () => {
      const { processor, notifications, mailer } = buildProcessor();
      notifications.findForDelivery.mockResolvedValue(NOTIFICATION);
      mailer.sendMail.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(processor.process(buildJob())).rejects.toThrow('ECONNREFUSED');
      expect(notifications.markFailed).not.toHaveBeenCalled();
    });
  });

  describe('boarding-reminder', () => {
    it('delega pro NotificationsService (que reconfirma o status antes de notificar)', async () => {
      const { processor, notifications } = buildProcessor();
      await processor.process(buildJob({ name: BOARDING_REMINDER_JOB, data: { bookingId: 'booking-1' } }));
      expect(notifications.notifyBoardingReminderIfStillConfirmed).toHaveBeenCalledWith('booking-1');
    });
  });

  describe('job.name desconhecido', () => {
    it('lanca em vez de ignorar silenciosamente', async () => {
      const { processor } = buildProcessor();
      await expect(processor.process(buildJob({ name: 'algo-inesperado' }))).rejects.toThrow(/desconhecido/);
    });
  });

  describe('onJobFailed (dead-letter, ver ADR-0019)', () => {
    it('tentativa ainda nao final: nao marca FAILED, nao manda pra dead-letter', async () => {
      const { processor, notifications, deadLetterQueue } = buildProcessor();
      const job = buildJob({ attemptsMade: 2, attempts: 5 });

      await processor.onJobFailed(job, new Error('timeout transitorio'));

      expect(notifications.markFailed).not.toHaveBeenCalled();
      expect(deadLetterQueue.add).not.toHaveBeenCalled();
    });

    it('ultima tentativa esgotada: marca FAILED, audita, e manda pra fila de dead-letter', async () => {
      const { processor, notifications, auditLog, deadLetterQueue } = buildProcessor();
      const job = buildJob({ attemptsMade: 5, attempts: 5, data: { notificationId: 'notif-1' } });

      await processor.onJobFailed(job, new Error('SMTP fora do ar'));

      expect(notifications.markFailed).toHaveBeenCalledWith('notif-1', 'SMTP fora do ar');
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'notification.email_dead_lettered', entityType: 'Notification', entityId: 'notif-1' }),
      );
      expect(deadLetterQueue.add).toHaveBeenCalledWith(
        'dead-letter',
        expect.objectContaining({ originalJobName: SEND_NOTIFICATION_EMAIL_JOB, failedReason: 'SMTP fora do ar', attemptsMade: 5 }),
      );
    });

    it('boarding-reminder esgotado tambem vai pra dead-letter, mas nao mexe em Notification (nenhuma foi criada ainda)', async () => {
      const { processor, notifications, deadLetterQueue } = buildProcessor();
      const job = buildJob({ name: BOARDING_REMINDER_JOB, attemptsMade: 5, attempts: 5, data: { bookingId: 'booking-1' } });

      await processor.onJobFailed(job, new Error('erro qualquer'));

      expect(notifications.markFailed).not.toHaveBeenCalled();
      expect(deadLetterQueue.add).toHaveBeenCalledWith('dead-letter', expect.objectContaining({ originalJobName: BOARDING_REMINDER_JOB }));
    });
  });
});
