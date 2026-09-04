import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import type { NotificationType } from '@prisma/client';
import type { Queue } from 'bullmq';
import { PrismaService } from '../database/prisma/prisma.service';
import {
  BOARDING_REMINDER_JOB,
  NOTIFICATIONS_QUEUE,
  SEND_NOTIFICATION_EMAIL_JOB,
  type BoardingReminderJobData,
  type SendNotificationEmailJobData,
} from './notifications-queue';
import {
  bookingCancelledContent,
  bookingConfirmedContent,
  boardingReminderContent,
  eventChangedContent,
  paymentApprovedContent,
  paymentDeclinedContent,
  ticketAvailableContent,
  type NotificationContent,
} from './notification-templates';

/**
 * Camada de negocio das notificacoes (ver ADR-0019): monta o conteudo,
 * persiste a linha (auditavel, consultavel via `GET /notifications/me` —
 * mesmo fora do ar o SMTP, o registro "isto deveria ter sido notificado"
 * existe) e enfileira o envio de verdade. Nunca lanca por causa de um
 * booking/payment/event que sumiu entre o evento disparar e este metodo
 * rodar (`if (!x) return`) — quem chama (o listener de dominio) tambem esta
 * num contexto "melhor esforco", nunca no caminho critico do request.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly queue: Queue,
    private readonly config: ConfigService,
  ) {}

  private async createAndEnqueue(input: {
    userId: string;
    bookingId?: string;
    type: NotificationType;
    content: NotificationContent;
  }): Promise<void> {
    const notification = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        bookingId: input.bookingId,
        type: input.type,
        channel: 'EMAIL',
        title: input.content.subject,
        message: input.content.text,
        htmlBody: input.content.html,
      },
    });

    // jobId deterministico (nao o default aleatorio do BullMQ) — dedup em nivel de fila: se este
    // metodo rodar duas vezes pro MESMO registro (nao deveria, mas ver ADR-0019 sobre defesa em
    // profundidade), o segundo `add` com o mesmo jobId e um no-op enquanto o primeiro ainda esta
    // waiting/active. A checagem de `deliveryStatus` no processor cobre o caso do job ja ter sido
    // removido (completed) e alguem tentar reenfileirar depois.
    const data: SendNotificationEmailJobData = { notificationId: notification.id };
    await this.queue.add(SEND_NOTIFICATION_EMAIL_JOB, data, { jobId: `email-${notification.id}` });
  }

  // ==========================================================================
  // Disparadas por eventos de dominio (ver NotificationsDomainEventsListener)
  // ==========================================================================

  async notifyBookingConfirmed(bookingId: string): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        userId: true,
        totalAmount: true,
        user: { select: { fullName: true } },
        cruise: { select: { title: true, embarkationDate: true } },
        cabin: { select: { code: true } },
      },
    });
    if (!booking) return;

    const content = bookingConfirmedContent({
      fullName: booking.user.fullName,
      cruiseTitle: booking.cruise.title,
      cabinCode: booking.cabin.code,
      embarkationDate: booking.cruise.embarkationDate,
      totalAmount: booking.totalAmount.toString(),
    });
    await this.createAndEnqueue({ userId: booking.userId, bookingId, type: 'BOOKING_CONFIRMED', content });
  }

  async notifyPaymentApproved(paymentId: string): Promise<void> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        amount: true,
        method: true,
        booking: { select: { id: true, userId: true, user: { select: { fullName: true } }, cruise: { select: { title: true } } } },
      },
    });
    if (!payment) return;

    const content = paymentApprovedContent({
      fullName: payment.booking.user.fullName,
      cruiseTitle: payment.booking.cruise.title,
      amount: payment.amount.toString(),
      method: payment.method,
    });
    await this.createAndEnqueue({ userId: payment.booking.userId, bookingId: payment.booking.id, type: 'PAYMENT_APPROVED', content });
  }

  async notifyPaymentDeclined(paymentId: string): Promise<void> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        failureReason: true,
        booking: { select: { id: true, userId: true, user: { select: { fullName: true } }, cruise: { select: { title: true } } } },
      },
    });
    if (!payment) return;

    const content = paymentDeclinedContent({
      fullName: payment.booking.user.fullName,
      cruiseTitle: payment.booking.cruise.title,
      reason: payment.failureReason,
    });
    await this.createAndEnqueue({ userId: payment.booking.userId, bookingId: payment.booking.id, type: 'PAYMENT_DECLINED', content });
  }

  async notifyTicketsAvailable(bookingId: string, ticketCount: number): Promise<void> {
    if (ticketCount <= 0) return;
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { userId: true, user: { select: { fullName: true } }, cruise: { select: { title: true } } },
    });
    if (!booking) return;

    const content = ticketAvailableContent({ fullName: booking.user.fullName, cruiseTitle: booking.cruise.title, ticketCount });
    await this.createAndEnqueue({ userId: booking.userId, bookingId, type: 'TICKET_AVAILABLE', content });
  }

  async notifyBookingCancelled(bookingId: string, reason: string | null, cancelledBy: 'PASSENGER' | 'ADMIN'): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { userId: true, user: { select: { fullName: true } }, cruise: { select: { title: true } } },
    });
    if (!booking) return;

    const content = bookingCancelledContent({ fullName: booking.user.fullName, cruiseTitle: booking.cruise.title, reason, cancelledBy });
    await this.createAndEnqueue({ userId: booking.userId, bookingId, type: 'BOOKING_CANCELLED', content });
  }

  /** Um evento pode ter varios passageiros que o reservaram — uma notificacao por reserva CONFIRMED (ver ActivitiesService.reserveEvent). */
  async notifyEventUpdated(eventId: string): Promise<void> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        title: true,
        startAt: true,
        venue: { select: { name: true } },
        cruise: { select: { title: true } },
        reservations: {
          where: { status: 'CONFIRMED' },
          select: { booking: { select: { id: true, userId: true, user: { select: { fullName: true } } } } },
        },
      },
    });
    if (!event) return;

    for (const reservation of event.reservations) {
      const content = eventChangedContent({
        fullName: reservation.booking.user.fullName,
        eventTitle: event.title,
        cruiseTitle: event.cruise.title,
        startAt: event.startAt,
        venueName: event.venue.name,
      });
      await this.createAndEnqueue({ userId: reservation.booking.userId, bookingId: reservation.booking.id, type: 'ITINERARY_CHANGED', content });
    }
  }

  // ==========================================================================
  // Lembrete de embarque — disparado por TEMPO, nao por evento (ver ADR-0019)
  // ==========================================================================

  /** Usado pelo listener de BOOKING_CONFIRMED so pra saber QUANDO agendar (ver scheduleBoardingReminder). */
  async findBookingEmbarkationDate(bookingId: string): Promise<{ embarkationDate: Date } | null> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { cruise: { select: { embarkationDate: true } } },
    });
    return booking ? { embarkationDate: booking.cruise.embarkationDate } : null;
  }

  /** Chamado pelo listener de BOOKING_CONFIRMED — agenda o job, NAO cria a notificacao ainda (nada aconteceu pra notificar sobre, so daqui a dias). */
  async scheduleBoardingReminder(bookingId: string, embarkationDate: Date): Promise<void> {
    const hoursBefore = this.config.get<number>('BOARDING_REMINDER_HOURS_BEFORE', 24);
    const remindAt = embarkationDate.getTime() - hoursBefore * 60 * 60 * 1000;
    const delay = Math.max(0, remindAt - Date.now());

    const data: BoardingReminderJobData = { bookingId };
    await this.queue.add(BOARDING_REMINDER_JOB, data, { jobId: `boarding-reminder-${bookingId}`, delay });
    this.logger.debug(`Lembrete de embarque agendado pra reserva ${bookingId} em ${new Date(Date.now() + delay).toISOString()}.`);
  }

  /** Roda quando o delay do job acima vence — reconfirma que a reserva AINDA esta CONFIRMED antes de gerar a notificacao de verdade. */
  async notifyBoardingReminderIfStillConfirmed(bookingId: string): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        status: true,
        userId: true,
        user: { select: { fullName: true } },
        cruise: { select: { title: true, embarkationDate: true } },
        cabin: { select: { code: true } },
      },
    });
    if (!booking || booking.status !== 'CONFIRMED') {
      this.logger.debug(`Lembrete de embarque ignorado pra reserva ${bookingId}: nao esta mais CONFIRMED.`);
      return;
    }

    const content = boardingReminderContent({
      fullName: booking.user.fullName,
      cruiseTitle: booking.cruise.title,
      embarkationDate: booking.cruise.embarkationDate,
      cabinCode: booking.cabin.code,
    });
    await this.createAndEnqueue({ userId: booking.userId, bookingId, type: 'CHECKIN_REMINDER', content });
  }

  // ==========================================================================
  // Usado pelo NotificationsProcessor (envio de verdade) e pelo controller de leitura
  // ==========================================================================

  async findForDelivery(notificationId: string) {
    return this.prisma.notification.findUnique({
      where: { id: notificationId },
      include: { user: { select: { email: true } } },
    });
  }

  async markSent(notificationId: string): Promise<void> {
    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { deliveryStatus: 'SENT', sentAt: new Date(), deliveryError: null },
    });
  }

  async markFailed(notificationId: string, error: string): Promise<void> {
    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { deliveryStatus: 'FAILED', deliveryError: error.slice(0, 500) },
    });
  }
}
