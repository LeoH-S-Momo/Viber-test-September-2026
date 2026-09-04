import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleKey } from '@prisma/client';
import {
  ConfirmCheckInSchema,
  LookupCheckInSchema,
  type ConfirmCheckInInput,
  type LookupCheckInInput,
} from '@seapass/contracts';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { requireOrganizerId } from '../../../common/utils/auth-context';
import type { AuthenticatedUser } from '../../auth/types/jwt-payload';
import { TicketsService } from '../application/tickets.service';

/**
 * Modulo de check-in do Staff (ver ADR-0013): duas etapas, deliberadamente
 * separadas — `lookup` (consulta, sem efeito colateral, mostra o ticket e o
 * estado antes de confirmar) e `confirm` (a mutacao de verdade, revalida
 * tudo sob lock). Restrito a ORGANIZER_STAFF/ORGANIZER_ADMIN do MESMO
 * organizador do cruzeiro do ticket — a validacao real acontece inteira no
 * backend (`TicketsService`/`CheckInPolicy`), nunca confiada ao cliente.
 */
@ApiTags('check-in')
@ApiBearerAuth()
@Controller('check-in')
export class CheckInController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Roles(RoleKey.ORGANIZER_STAFF, RoleKey.ORGANIZER_ADMIN)
  @Post('lookup')
  @HttpCode(HttpStatus.OK)
  lookup(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(LookupCheckInSchema)) body: LookupCheckInInput,
  ) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_STAFF, RoleKey.ORGANIZER_ADMIN);
    return this.ticketsService.lookupForCheckIn(organizerId, body.code);
  }

  @Roles(RoleKey.ORGANIZER_STAFF, RoleKey.ORGANIZER_ADMIN)
  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(ConfirmCheckInSchema)) body: ConfirmCheckInInput,
  ) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_STAFF, RoleKey.ORGANIZER_ADMIN);
    return this.ticketsService.confirmCheckIn(organizerId, user.sub, body.code, body.location);
  }
}
