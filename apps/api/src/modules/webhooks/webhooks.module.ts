import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module';
import { PaymentsWebhookController } from './presentation/payments-webhook.controller';
import { WebhooksService } from './application/webhooks.service';
import { WebhookEventsRepository } from './persistence/webhook-events.repository';

@Module({
  imports: [BookingsModule],
  controllers: [PaymentsWebhookController],
  providers: [WebhooksService, WebhookEventsRepository],
})
export class WebhooksModule {}
