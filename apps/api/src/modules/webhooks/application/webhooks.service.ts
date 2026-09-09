import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { BookingsService } from '../../bookings/application/bookings.service';
import type { EnvConfig } from '../../../config/env.schema';
import { WebhookEventsRepository } from '../persistence/webhook-events.repository';

export interface PaymentWebhookResult {
  /** true quando este eventId ja tinha sido processado antes — nada foi reprocessado (idempotencia). */
  duplicate: boolean;
  /** false quando gatewayTransactionId nao corresponde a nenhum Payment conhecido. */
  found: boolean;
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly webhookEventsRepository: WebhookEventsRepository,
    private readonly bookingsService: BookingsService,
  ) {}

  /**
   * HMAC-SHA256 sobre o corpo CRU (bytes exatos recebidos, nao o JSON reserializado — ver
   * main.ts `rawBody: true`) — mesmo principio de `TokensService.hashToken`. `timingSafeEqual`
   * evita vazar quantos bytes bateram por timing (comparacao ingenua com `===` seria vulneravel).
   */
  verifySignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
    if (!signatureHeader) {
      return false;
    }
    const secret = this.configService.get('WEBHOOK_SECRET', { infer: true });
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');

    const expectedBuffer = Buffer.from(expected, 'hex');
    const providedBuffer = Buffer.from(signatureHeader, 'hex');
    if (expectedBuffer.length !== providedBuffer.length) {
      return false;
    }
    return timingSafeEqual(expectedBuffer, providedBuffer);
  }

  /**
   * Idempotente por `eventId` (o gateway pode reenviar o mesmo evento — nunca reprocessa). O
   * `outcome` do payload nunca e aplicado diretamente: `confirmPaymentByTransactionId` sempre
   * reconsulta o gateway antes de mudar qualquer coisa (ver ADR do webhook de pagamento).
   */
  async handlePaymentEvent(
    eventId: string,
    provider: string,
    payload: Prisma.InputJsonValue,
    gatewayTransactionId: string,
  ): Promise<PaymentWebhookResult> {
    const existing = await this.webhookEventsRepository.findByEventId(eventId);
    if (existing) {
      this.logger.debug(`Evento de webhook ${eventId} ja processado — ignorando reenvio.`);
      return { duplicate: true, found: true };
    }
    await this.webhookEventsRepository.create({ provider, eventId, payload });

    const booking = await this.bookingsService.confirmPaymentByTransactionId(gatewayTransactionId);
    if (!booking) {
      await this.webhookEventsRepository.markError(eventId, `Transacao desconhecida: ${gatewayTransactionId}`);
      return { duplicate: false, found: false };
    }

    await this.webhookEventsRepository.markProcessed(eventId);
    return { duplicate: false, found: true };
  }
}
