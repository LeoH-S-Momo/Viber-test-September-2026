import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleKey } from '@prisma/client';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/types/jwt-payload';
import { TicketsService } from '../application/tickets.service';

/** Ingresso digital do passageiro — ver ADR-0013. O modulo de check-in (staff) vive em check-in.controller.ts. */
@ApiTags('tickets')
@ApiBearerAuth()
@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Roles(RoleKey.PASSENGER)
  @Get('me')
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.ticketsService.findMine(user.sub);
  }
}
