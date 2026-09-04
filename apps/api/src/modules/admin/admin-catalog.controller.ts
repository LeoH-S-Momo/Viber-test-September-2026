import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleKey } from '@prisma/client';
import {
  AdminCabinsQuerySchema,
  AdminCruisesQuerySchema,
  AdminEventsQuerySchema,
  AdminExperiencesQuerySchema,
  AdminRestaurantsQuerySchema,
  AdminShipsQuerySchema,
  type AdminCabinsQuery,
  type AdminCruisesQuery,
  type AdminEventsQuery,
  type AdminExperiencesQuery,
  type AdminRestaurantsQuery,
  type AdminShipsQuery,
} from '@seapass/contracts';
import { z } from 'zod';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../auth/types/jwt-payload';
import { AdminCatalogService } from './admin-catalog.service';

const CancelCruiseBodySchema = z.object({ reason: z.string().max(300).optional() });

@ApiTags('admin')
@ApiBearerAuth()
@Roles(RoleKey.PLATFORM_ADMIN)
@Controller('admin')
export class AdminCatalogController {
  constructor(private readonly adminCatalogService: AdminCatalogService) {}

  @Get('cruises')
  listCruises(@Query(new ZodValidationPipe(AdminCruisesQuerySchema)) query: AdminCruisesQuery) {
    return this.adminCatalogService.listCruises(query);
  }

  @Get('cruises/:id')
  getCruise(@Param('id') id: string) {
    return this.adminCatalogService.getCruise(id);
  }

  @Patch('cruises/:id/cancel')
  cancelCruise(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CancelCruiseBodySchema)) body: { reason?: string },
  ) {
    return this.adminCatalogService.cancelCruise(user.sub, id, body.reason);
  }

  @Get('ships')
  listShips(@Query(new ZodValidationPipe(AdminShipsQuerySchema)) query: AdminShipsQuery) {
    return this.adminCatalogService.listShips(query);
  }

  @Get('ships/:id')
  getShip(@Param('id') id: string) {
    return this.adminCatalogService.getShip(id);
  }

  @Get('cabins')
  listCabins(@Query(new ZodValidationPipe(AdminCabinsQuerySchema)) query: AdminCabinsQuery) {
    return this.adminCatalogService.listCabins(query);
  }

  @Get('cabins/:id')
  getCabin(@Param('id') id: string) {
    return this.adminCatalogService.getCabin(id);
  }

  @Get('events')
  listEvents(@Query(new ZodValidationPipe(AdminEventsQuerySchema)) query: AdminEventsQuery) {
    return this.adminCatalogService.listEvents(query);
  }

  @Get('events/:id')
  getEvent(@Param('id') id: string) {
    return this.adminCatalogService.getEvent(id);
  }

  @Get('restaurants')
  listRestaurants(@Query(new ZodValidationPipe(AdminRestaurantsQuerySchema)) query: AdminRestaurantsQuery) {
    return this.adminCatalogService.listRestaurants(query);
  }

  @Get('restaurants/:id')
  getRestaurant(@Param('id') id: string) {
    return this.adminCatalogService.getRestaurant(id);
  }

  @Get('experiences')
  listExperiences(@Query(new ZodValidationPipe(AdminExperiencesQuerySchema)) query: AdminExperiencesQuery) {
    return this.adminCatalogService.listExperiences(query);
  }

  @Get('experiences/:id')
  getExperience(@Param('id') id: string) {
    return this.adminCatalogService.getExperience(id);
  }
}
