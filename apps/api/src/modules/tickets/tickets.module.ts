import { Module } from '@nestjs/common';
import { CheckInController } from './presentation/check-in.controller';
import { TicketsController } from './presentation/tickets.controller';
import { TicketsService } from './application/tickets.service';
import { TicketsRepository } from './persistence/tickets.repository';

@Module({
  controllers: [TicketsController, CheckInController],
  providers: [TicketsService, TicketsRepository],
  // Exportado para BookingsModule injetar em TicketIssuanceProcessor e em
  // BookingsService (cancelamento de tickets ao cancelar uma reserva
  // confirmada — ver ADR-0012/0013). TicketsModule nao depende de
  // BookingsModule de volta, entao nao ha ciclo.
  exports: [TicketsService],
})
export class TicketsModule {}
