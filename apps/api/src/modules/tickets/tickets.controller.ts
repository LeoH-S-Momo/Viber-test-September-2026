import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleKey } from '@prisma/client';
import { CheckInSchema, type CheckInInput } from '@seapass/contracts';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { requireOrganizerId } from '../../common/utils/auth-context';
import type { AuthenticatedUser } from '../auth/types/jwt-payload';
import { TicketsService } from './tickets.service';

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

  /** Operacao de embarque — restrita a staff/admin do organizador dono do cruzeiro do ticket. */
  @Roles(RoleKey.ORGANIZER_STAFF, RoleKey.ORGANIZER_ADMIN)
  @Post(':id/check-in')
  checkIn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') ticketId: string,
    @Body(new ZodValidationPipe(CheckInSchema)) body: CheckInInput,
  ) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_STAFF, RoleKey.ORGANIZER_ADMIN);
    return this.ticketsService.checkIn(organizerId, user.sub, ticketId, body);
  }
}
