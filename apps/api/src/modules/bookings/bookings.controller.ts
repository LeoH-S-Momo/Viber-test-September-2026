import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleKey } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/jwt-payload';
import { BookingsService } from './bookings.service';

/**
 * So leitura por enquanto — criacao de reserva (checkout) e proposital-
 * mente fora de escopo aqui (ver docs/product/BACKLOG.md).
 */
@ApiTags('bookings')
@ApiBearerAuth()
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Roles(RoleKey.PASSENGER)
  @Get('me')
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.bookingsService.findMine(user.sub);
  }
}
