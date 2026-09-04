import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MailerService } from './mailer.service';
import { NotificationsService } from './notifications.service';
import { NotificationsDomainEventsListener } from './notifications-domain-events.listener';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsDeadLetterProcessor } from './notifications-dead-letter.processor';
import { NotificationsController } from './notifications.controller';
import { NOTIFICATIONS_DEAD_LETTER_QUEUE, NOTIFICATIONS_QUEUE } from './notifications-queue';

/**
 * Auto-contido de proposito (ver ADR-0019): so depende de modulos globais
 * (`PrismaModule`, `ConfigModule`, `AuditLogModule` — nenhum import
 * explicito necessario) e do `EventEmitterModule.forRoot()` registrado em
 * `AppModule`. NENHUM outro modulo (Bookings, Tickets, Activities, Catalog)
 * importa este — eles so emitem eventos de dominio (`EventEmitter2`,
 * tambem global) sem saber que notificacoes existem. Essa e a motivacao
 * inteira de ter uma camada de eventos: zero acoplamento entre "algo
 * aconteceu" e "manda um e-mail sobre isso".
 */
@Module({
  imports: [
    BullModule.registerQueue(
      {
        name: NOTIFICATIONS_QUEUE,
        defaultJobOptions: {
          // 5 tentativas com backoff exponencial (3s, 6s, 12s, 24s, 48s) — falha transitoria de
          // SMTP (MailHog fora do ar, timeout de rede) se resolve sozinha na maioria dos casos
          // sem intervencao manual. Ver NotificationsProcessor pra retry/idempotencia/dead-letter.
          attempts: 5,
          backoff: { type: 'exponential', delay: 3000 },
          // BullMQ nao guarda job completo/failed pra sempre por padrao (memoria do Redis) —
          // mantem um historico pequeno pra inspecao manual sem crescer sem limite.
          removeOnComplete: { count: 200 },
          removeOnFail: { count: 500 },
        },
      },
      // Dead-letter nunca tenta de novo (attempts: 1 = default) — ela JA E o resultado final de
      // outra fila que esgotou as proprias tentativas; falhar de novo aqui so significaria "nao
      // conseguiu nem logar a falha", o que preferimos deixar bem visivel (job cai como failed
      // na propria dead-letter) a mascarar com mais retries.
      { name: NOTIFICATIONS_DEAD_LETTER_QUEUE, defaultJobOptions: { removeOnComplete: { count: 500 } } },
    ),
  ],
  controllers: [NotificationsController],
  providers: [
    MailerService,
    NotificationsService,
    NotificationsDomainEventsListener,
    NotificationsProcessor,
    NotificationsDeadLetterProcessor,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
