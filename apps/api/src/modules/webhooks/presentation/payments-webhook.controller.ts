import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { PaymentWebhookEventSchema, type PaymentWebhookEventInput } from '@seapass/contracts';
import { Public } from '../../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { WebhooksService } from '../application/webhooks.service';

/**
 * Endpoint publico (sem JWT — o "gateway" nao tem sessao de usuario) que simula a confirmacao
 * assincrona de um pagamento (boleto). Autenticado por assinatura HMAC (`X-Webhook-Signature`),
 * nao por token — ver WebhooksService.verifySignature.
 */
@ApiTags('webhooks')
@Public()
@Controller('webhooks/payments')
export class PaymentsWebhookController {
  constructor(private readonly webhooksService: WebhooksService) {}

  // Limite proprio, mais generoso que o piso global de 100/min padrao teria isolado — um gateway
  // de verdade pode reenviar rajadas de eventos atrasados; auth por assinatura (nao por
  // credencial adivinhavel) e a defesa real aqui, o throttle so contem volume bruto.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post()
  @HttpCode(HttpStatus.OK)
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-webhook-signature') signature: string | undefined,
    @Headers('x-webhook-event-id') eventId: string | undefined,
    @Body(new ZodValidationPipe(PaymentWebhookEventSchema)) body: PaymentWebhookEventInput,
  ) {
    if (!eventId) {
      throw new BadRequestException('Header X-Webhook-Event-Id e obrigatorio.');
    }
    if (!req.rawBody || !this.webhooksService.verifySignature(req.rawBody, signature)) {
      throw new UnauthorizedException('Assinatura invalida.');
    }

    const result = await this.webhooksService.handlePaymentEvent(eventId, 'mock-gateway', body, body.gatewayTransactionId);
    if (!result.found) {
      throw new NotFoundException('Transacao de pagamento desconhecida.');
    }
    return { received: true, duplicate: result.duplicate };
  }
}
