import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleKey } from '@prisma/client';
import { CancelBookingSchema, type CancelBookingInput } from '@seapass/contracts';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../auth/types/jwt-payload';
import { BookingsService } from '../application/bookings.service';

/**
 * Motor de disponibilidade de cabine (ver ADR-0009): consulta publica de
 * disponibilidade, e o ciclo de vida do hold (criar, confirmar, cancelar,
 * liberar) restrito ao passageiro dono da reserva. Emissao de ingresso e
 * pagamento a partir de uma reserva CONFIRMED continuam fora de escopo.
 */
@ApiTags('bookings')
@Controller()
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @ApiBearerAuth()
  @Roles(RoleKey.PASSENGER)
  @Get('bookings/me')
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.bookingsService.findMine(user.sub);
  }

  @Public()
  @Get('cruises/:cruiseSlug/cabins/:cabinId/availability')
  async availability(@Param('cruiseSlug') cruiseSlug: string, @Param('cabinId') cabinId: string) {
    const availability = await this.bookingsService.getCabinAvailability(cruiseSlug, cabinId);
    return { cabinId, availability };
  }

  @ApiBearerAuth()
  @Roles(RoleKey.PASSENGER)
  @Post('cruises/:cruiseSlug/cabins/:cabinId/hold')
  holdCabin(
    @CurrentUser() user: AuthenticatedUser,
    @Param('cruiseSlug') cruiseSlug: string,
    @Param('cabinId') cabinId: string,
  ) {
    return this.bookingsService.holdCabin(user.sub, cruiseSlug, cabinId);
  }

  @ApiBearerAuth()
  @Roles(RoleKey.PASSENGER)
  @Post('bookings/:id/confirm')
  @HttpCode(HttpStatus.OK)
  confirm(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.bookingsService.confirmBooking(id, user.sub);
  }

  @ApiBearerAuth()
  @Roles(RoleKey.PASSENGER)
  @Post('bookings/:id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CancelBookingSchema)) body: CancelBookingInput,
  ) {
    return this.bookingsService.cancelBooking(id, user.sub, body.reason);
  }

  @ApiBearerAuth()
  @Roles(RoleKey.PASSENGER)
  @Post('bookings/:id/release')
  @HttpCode(HttpStatus.OK)
  release(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.bookingsService.releaseHold(id, user.sub);
  }
}
