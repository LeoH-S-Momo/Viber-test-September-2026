import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleKey } from '@prisma/client';
import {
  CreateDiningSlotSchema,
  DiningAvailabilityQuerySchema,
  ReserveDiningSchema,
  ReserveEventSchema,
  UpdateDiningSlotSchema,
  type CreateDiningSlotInput,
  type DiningAvailabilityQuery,
  type ReserveDiningInput,
  type ReserveEventInput,
  type UpdateDiningSlotInput,
} from '@seapass/contracts';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../auth/types/jwt-payload';
import { ActivitiesService } from '../application/activities.service';

/**
 * Experiencia interna do cruzeiro — reserva de eventos e restaurantes
 * dentro de uma viagem ja confirmada (ver ADR-0014). Rotas aninhadas em
 * `/bookings/:bookingId/...`, mesmo padrao de `CheckInController` viver
 * dentro do modulo de tickets mas expor rotas `/check-in/...`.
 */
@ApiTags('activities')
@Controller()
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Public()
  @Get('events/:eventId/availability')
  eventAvailability(@Param('eventId') eventId: string) {
    return this.activitiesService.getEventAvailability(eventId);
  }

  @Public()
  @Get('dining-slots/:diningSlotId/availability')
  diningAvailability(
    @Param('diningSlotId') diningSlotId: string,
    @Query(new ZodValidationPipe(DiningAvailabilityQuerySchema)) query: DiningAvailabilityQuery,
  ) {
    return this.activitiesService.getDiningAvailability(diningSlotId, query.date);
  }

  @ApiBearerAuth()
  @Roles(RoleKey.PASSENGER)
  @Post('bookings/:bookingId/event-reservations/:eventId')
  @HttpCode(HttpStatus.OK)
  reserveEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bookingId') bookingId: string,
    @Param('eventId') eventId: string,
    @Body(new ZodValidationPipe(ReserveEventSchema)) body: ReserveEventInput,
  ) {
    return this.activitiesService.reserveEvent(user.sub, bookingId, eventId, body.partySize);
  }

  @ApiBearerAuth()
  @Roles(RoleKey.PASSENGER)
  @Post('bookings/:bookingId/event-reservations/:reservationId/cancel')
  @HttpCode(HttpStatus.OK)
  cancelEventReservation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bookingId') bookingId: string,
    @Param('reservationId') reservationId: string,
  ) {
    return this.activitiesService.cancelEventReservation(user.sub, bookingId, reservationId);
  }

  @ApiBearerAuth()
  @Roles(RoleKey.PASSENGER)
  @Get('bookings/me/event-reservations')
  myEventReservations(@CurrentUser() user: AuthenticatedUser) {
    return this.activitiesService.listMyEventReservations(user.sub);
  }

  @ApiBearerAuth()
  @Roles(RoleKey.PASSENGER)
  @Post('bookings/:bookingId/dining-reservations')
  @HttpCode(HttpStatus.OK)
  reserveDining(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bookingId') bookingId: string,
    @Body(new ZodValidationPipe(ReserveDiningSchema)) body: ReserveDiningInput,
  ) {
    return this.activitiesService.reserveDining(
      user.sub,
      bookingId,
      body.diningSlotId,
      body.partySize,
      body.reservationDate,
    );
  }

  @ApiBearerAuth()
  @Roles(RoleKey.PASSENGER)
  @Post('bookings/:bookingId/dining-reservations/:reservationId/cancel')
  @HttpCode(HttpStatus.OK)
  cancelDiningReservation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bookingId') bookingId: string,
    @Param('reservationId') reservationId: string,
  ) {
    return this.activitiesService.cancelDiningReservation(user.sub, bookingId, reservationId);
  }

  @ApiBearerAuth()
  @Roles(RoleKey.PASSENGER)
  @Get('bookings/me/dining-reservations')
  myDiningReservations(@CurrentUser() user: AuthenticatedUser) {
    return this.activitiesService.listMyDiningReservations(user.sub);
  }

  // --- Cadastro de horarios de restaurante (organizador) ---------------------

  @ApiBearerAuth()
  @Roles(RoleKey.ORGANIZER_ADMIN)
  @Post('restaurants/:restaurantId/dining-slots')
  createDiningSlot(
    @CurrentUser() user: AuthenticatedUser,
    @Param('restaurantId') restaurantId: string,
    @Body(new ZodValidationPipe(CreateDiningSlotSchema)) body: CreateDiningSlotInput,
  ) {
    return this.activitiesService.createDiningSlot(user, restaurantId, body);
  }

  @ApiBearerAuth()
  @Roles(RoleKey.ORGANIZER_ADMIN)
  @Patch('dining-slots/:diningSlotId')
  updateDiningSlot(
    @CurrentUser() user: AuthenticatedUser,
    @Param('diningSlotId') diningSlotId: string,
    @Body(new ZodValidationPipe(UpdateDiningSlotSchema)) body: UpdateDiningSlotInput,
  ) {
    return this.activitiesService.updateDiningSlot(user, diningSlotId, body);
  }
}
