import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CabinHoldExpirationProcessor } from '../../jobs/cabin-hold-expiration.processor';
import { CABIN_HOLD_EXPIRATION_QUEUE } from '../../jobs/cabin-hold-queue';
import { TicketIssuanceProcessor } from '../../jobs/ticket-issuance.processor';
import { TICKET_ISSUANCE_QUEUE } from '../../jobs/ticket-issuance-queue';
import { ActivitiesModule } from '../activities/activities.module';
import { PaymentsModule } from '../payments/payments.module';
import { TicketsModule } from '../tickets/tickets.module';
import { BookingsController } from './presentation/bookings.controller';
import { BookingsService } from './application/bookings.service';
import { BookingsRepository } from './persistence/bookings.repository';

/**
 * As filas e processors de expiracao de hold (ADR-0009) e de emissao de
 * ticket (ADR-0012) sao registrados AQUI, no modulo a que pertencem
 * funcionalmente, em vez de um JobsModule separado — um JobsModule que
 * precisasse importar BookingsModule (pro processor chamar BookingsService/
 * TicketsService) enquanto BookingsModule tambem precisa da fila do
 * JobsModule (pra enfileirar) criaria um ciclo de modulos. `jobs/` continua
 * sendo so a convencao de ONDE o arquivo do processor mora (ver
 * jobs/README.md), nao necessariamente um NestModule proprio.
 *
 * `PaymentsModule` fornece o `PAYMENT_GATEWAY` (ver ADR-0012), `TicketsModule` fornece
 * `TicketsService` (pro `TicketIssuanceProcessor`) e `ActivitiesModule` fornece
 * `ActivitiesService` (pra cancelar reservas de evento/restaurante junto do cancelamento da
 * reserva — sem isto elas ficavam CONFIRMED presas pra sempre, consumindo capacidade do
 * evento/horario indefinidamente mesmo com a viagem cancelada) — nenhum dos tres importa
 * `BookingsModule` de volta, entao nao ha ciclo.
 */
@Module({
  imports: [
    BullModule.registerQueue(
      { name: CABIN_HOLD_EXPIRATION_QUEUE, defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 2000 } } },
      // Retry importa MUITO mais aqui (ver ADR-0020): sem isto, um blip do Redis no exato
      // momento em que um pagamento e aprovado significa uma reserva CONFIRMED que nunca
      // ganha ticket, descobrivel so vasculhando log manualmente — ver
      // TicketIssuanceProcessor.onJobFailed.
      { name: TICKET_ISSUANCE_QUEUE, defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 2000 } } },
    ),
    PaymentsModule,
    TicketsModule,
    ActivitiesModule,
  ],
  controllers: [BookingsController],
  providers: [BookingsService, BookingsRepository, CabinHoldExpirationProcessor, TicketIssuanceProcessor],
})
export class BookingsModule {}
