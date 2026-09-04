import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  DomainEvent,
  type BookingCancelledPayload,
  type BookingConfirmedPayload,
  type EventUpdatedPayload,
  type PaymentApprovedPayload,
  type PaymentFailedPayload,
  type TicketGeneratedPayload,
} from '../domain-events/domain-events';
import { NotificationsService } from './notifications.service';

/**
 * Traduz eventos de dominio em notificacoes (ver ADR-0019) — o unico lugar
 * que conhece a relacao "PAYMENT_APPROVED gera um e-mail de pagamento
 * aprovado". `BookingsService`/`TicketsService`/etc. nunca importam nada
 * daqui: so emitem o evento e seguem em frente.
 *
 * `@OnEvent` roda de forma SINCRONA em relacao ao `emitter.emit(...)` (mesmo
 * tick), mas quem emite nunca faz `await` nisso (ver os pontos de emissao em
 * bookings.service.ts etc.) — entao, na pratica, o handler roda "em segundo
 * plano" sem bloquear a resposta HTTP que disparou o evento. Por isso cada
 * handler abaixo tem seu proprio try/catch: nada aqui tem um `caller`
 * esperando a promise, entao um erro nao tratado viraria um
 * unhandledRejection silencioso em vez de dar errado de um jeito visivel.
 * Falha aqui e sempre "so log e segue" — a pior consequencia possivel e "o
 * passageiro nao recebeu um e-mail", nunca "a reserva ficou num estado
 * inconsistente" (isso ja foi garantido pela transacao que rodou ANTES do
 * emit, ver domain-events.ts).
 */
@Injectable()
export class NotificationsDomainEventsListener {
  private readonly logger = new Logger(NotificationsDomainEventsListener.name);

  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent(DomainEvent.BOOKING_CONFIRMED)
  async onBookingConfirmed(payload: BookingConfirmedPayload): Promise<void> {
    await this.safely('BOOKING_CONFIRMED', payload, async () => {
      await this.notifications.notifyBookingConfirmed(payload.bookingId);
      // "Lembrete de embarque" e por TEMPO, nao por evento (ver
      // NotificationsService.scheduleBoardingReminder) — o gatilho natural
      // pra agendar e o mesmo momento em que a viagem vira confirmada.
      const booking = await this.notifications.findBookingEmbarkationDate(payload.bookingId);
      if (booking) {
        await this.notifications.scheduleBoardingReminder(payload.bookingId, booking.embarkationDate);
      }
    });
  }

  @OnEvent(DomainEvent.PAYMENT_APPROVED)
  async onPaymentApproved(payload: PaymentApprovedPayload): Promise<void> {
    await this.safely('PAYMENT_APPROVED', payload, () => this.notifications.notifyPaymentApproved(payload.paymentId));
  }

  @OnEvent(DomainEvent.PAYMENT_FAILED)
  async onPaymentFailed(payload: PaymentFailedPayload): Promise<void> {
    await this.safely('PAYMENT_FAILED', payload, () => this.notifications.notifyPaymentDeclined(payload.paymentId));
  }

  @OnEvent(DomainEvent.TICKET_GENERATED)
  async onTicketGenerated(payload: TicketGeneratedPayload): Promise<void> {
    await this.safely('TICKET_GENERATED', payload, () =>
      this.notifications.notifyTicketsAvailable(payload.bookingId, payload.ticketCount),
    );
  }

  @OnEvent(DomainEvent.BOOKING_CANCELLED)
  async onBookingCancelled(payload: BookingCancelledPayload): Promise<void> {
    await this.safely('BOOKING_CANCELLED', payload, () =>
      this.notifications.notifyBookingCancelled(payload.bookingId, payload.reason, payload.cancelledBy),
    );
  }

  @OnEvent(DomainEvent.EVENT_UPDATED)
  async onEventUpdated(payload: EventUpdatedPayload): Promise<void> {
    await this.safely('EVENT_UPDATED', payload, () => this.notifications.notifyEventUpdated(payload.eventId));
  }

  // BOOKING_CREATED e CHECKIN_COMPLETED nao tem listener aqui de proposito —
  // ver o comentario em domain-events.ts sobre eventos sem notificacao hoje.

  private async safely(eventName: string, payload: unknown, work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (error) {
      this.logger.error(
        `Falha ao processar notificacao pro evento ${eventName} (payload: ${JSON.stringify(payload)}): ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }
}
