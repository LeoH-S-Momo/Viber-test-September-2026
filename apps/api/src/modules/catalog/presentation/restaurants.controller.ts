import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleKey } from '@prisma/client';
import {
  CreateRestaurantSchema,
  UpdateRestaurantSchema,
  type CreateRestaurantInput,
  type UpdateRestaurantInput,
} from '@seapass/contracts';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { requireOrganizerId } from '../../../common/utils/auth-context';
import type { AuthenticatedUser } from '../../auth/types/jwt-payload';
import { RestaurantsService } from '../application/restaurants.service';

@ApiTags('catalog/restaurants')
@Controller()
export class RestaurantsController {
  constructor(private readonly restaurantsService: RestaurantsService) {}

  @Public()
  @Get('ships/:shipId/restaurants')
  list(@Param('shipId') shipId: string) {
    return this.restaurantsService.findByShip(shipId);
  }

  @ApiBearerAuth()
  @Roles(RoleKey.ORGANIZER_ADMIN)
  @Post('ships/:shipId/restaurants')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shipId') shipId: string,
    @Body(new ZodValidationPipe(CreateRestaurantSchema)) body: CreateRestaurantInput,
  ) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN);
    return this.restaurantsService.create(organizerId, shipId, body, user.sub);
  }

  @ApiBearerAuth()
  @Roles(RoleKey.ORGANIZER_ADMIN)
  @Patch('restaurants/:id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateRestaurantSchema)) body: UpdateRestaurantInput,
  ) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN);
    return this.restaurantsService.update(organizerId, id, body, user.sub);
  }
}
