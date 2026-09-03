import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleKey } from '@prisma/client';
import {
  CreateVenueSchema,
  UpdateVenueSchema,
  type CreateVenueInput,
  type UpdateVenueInput,
} from '@seapass/contracts';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { requireOrganizerId } from '../../../common/utils/auth-context';
import type { AuthenticatedUser } from '../../auth/types/jwt-payload';
import { VenuesService } from '../application/venues.service';

@ApiTags('catalog/venues')
@Controller()
export class VenuesController {
  constructor(private readonly venuesService: VenuesService) {}

  @Public()
  @Get('ships/:shipId/venues')
  list(@Param('shipId') shipId: string) {
    return this.venuesService.findByShip(shipId);
  }

  @ApiBearerAuth()
  @Roles(RoleKey.ORGANIZER_ADMIN)
  @Post('ships/:shipId/venues')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shipId') shipId: string,
    @Body(new ZodValidationPipe(CreateVenueSchema)) body: CreateVenueInput,
  ) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN);
    return this.venuesService.create(organizerId, shipId, body);
  }

  @ApiBearerAuth()
  @Roles(RoleKey.ORGANIZER_ADMIN)
  @Patch('venues/:id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateVenueSchema)) body: UpdateVenueInput,
  ) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN);
    return this.venuesService.update(organizerId, id, body);
  }
}
