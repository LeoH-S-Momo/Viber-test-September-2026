import { Module } from '@nestjs/common';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

@Module({
  controllers: [TicketsController],
  providers: [TicketsService],
  // Exportado para BookingsModule injetar em TicketIssuanceProcessor (ver ADR-0012) —
  // TicketsModule nao depende de BookingsModule de volta, entao nao ha ciclo.
  exports: [TicketsService],
})
export class TicketsModule {}
