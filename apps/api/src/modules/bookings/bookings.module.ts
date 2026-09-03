import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CabinHoldExpirationProcessor } from '../../jobs/cabin-hold-expiration.processor';
import { CABIN_HOLD_EXPIRATION_QUEUE } from '../../jobs/cabin-hold-queue';
import { BookingsController } from './presentation/bookings.controller';
import { BookingsService } from './application/bookings.service';
import { BookingsRepository } from './persistence/bookings.repository';

/**
 * A fila e o processor de expiracao de hold (ver jobs/cabin-hold-queue.ts e
 * jobs/cabin-hold-expiration.processor.ts) sao registrados AQUI, no modulo
 * a que pertencem funcionalmente, em vez de um JobsModule separado — um
 * JobsModule que precisasse importar BookingsModule (pro processor chamar
 * BookingsService) enquanto BookingsModule tambem precisa da fila do
 * JobsModule (pra enfileirar) criaria um ciclo de modulos. `jobs/` continua
 * sendo so a convencao de ONDE o arquivo do processor mora (ver
 * jobs/README.md), nao necessariamente um NestModule proprio.
 */
@Module({
  imports: [BullModule.registerQueue({ name: CABIN_HOLD_EXPIRATION_QUEUE })],
  controllers: [BookingsController],
  providers: [BookingsService, BookingsRepository, CabinHoldExpirationProcessor],
})
export class BookingsModule {}
