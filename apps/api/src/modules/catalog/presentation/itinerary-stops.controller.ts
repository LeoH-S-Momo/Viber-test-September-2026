import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleKey } from '@prisma/client';
import {
  CreateItineraryStopSchema,
  UpdateItineraryStopSchema,
  type CreateItineraryStopInput,
  type UpdateItineraryStopInput,
} from '@seapass/contracts';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { requireOrganizerId } from '../../../common/utils/auth-context';
import type { AuthenticatedUser } from '../../auth/types/jwt-payload';
import { ItineraryStopsService } from '../application/itinerary-stops.service';

@ApiTags('catalog/itinerary')
@Controller()
export class ItineraryStopsController {
  constructor(private readonly itineraryStopsService: ItineraryStopsService) {}

  @Public()
  @Get('cruises/:cruiseId/itinerary-stops')
  list(@Param('cruiseId') cruiseId: string) {
    return this.itineraryStopsService.findByCruise(cruiseId);
  }

  @ApiBearerAuth()
  @Roles(RoleKey.ORGANIZER_ADMIN)
  @Post('cruises/:cruiseId/itinerary-stops')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('cruiseId') cruiseId: string,
    @Body(new ZodValidationPipe(CreateItineraryStopSchema)) body: CreateItineraryStopInput,
  ) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN);
    return this.itineraryStopsService.create(organizerId, cruiseId, body);
  }

  @ApiBearerAuth()
  @Roles(RoleKey.ORGANIZER_ADMIN)
  @Patch('itinerary-stops/:id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateItineraryStopSchema)) body: UpdateItineraryStopInput,
  ) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN);
    return this.itineraryStopsService.update(organizerId, id, body);
  }
}
