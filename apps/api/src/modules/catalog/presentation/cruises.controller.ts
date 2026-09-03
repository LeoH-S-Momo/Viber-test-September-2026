import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleKey } from '@prisma/client';
import {
  CreateCruiseSchema,
  CruiseQuerySchema,
  SetCruiseCabinPricingSchema,
  UpdateCruiseSchema,
  type CreateCruiseInput,
  type CruiseQuery,
  type SetCruiseCabinPricingInput,
  type UpdateCruiseInput,
} from '@seapass/contracts';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { requireOrganizerId } from '../../../common/utils/auth-context';
import type { AuthenticatedUser } from '../../auth/types/jwt-payload';
import { CruisesService } from '../application/cruises.service';

@ApiTags('catalog/cruises')
@Controller('cruises')
export class CruisesController {
  constructor(private readonly cruisesService: CruisesService) {}

  /**
   * Catalogo publico. Filtros: theme, destination, embarkationFrom/To,
   * minPrice/maxPrice, organizerId — paginado e ordenavel. `status` e aceito
   * no schema mas ignorado aqui de proposito: usuarios publicos so veem
   * PUBLISHED, sempre (ver CruisesService.listPublished).
   */
  @Public()
  @Get()
  list(@Query(new ZodValidationPipe(CruiseQuerySchema)) query: CruiseQuery) {
    return this.cruisesService.listPublished(query);
  }

  @Public()
  @Get(':slug')
  detail(@Param('slug') slug: string) {
    return this.cruisesService.findBySlugPublished(slug);
  }

  /** Decks, cabines (com preco/disponibilidade deste cruzeiro), venues e restaurantes — mapa do navio. */
  @Public()
  @Get(':slug/deck-map')
  deckMap(@Param('slug') slug: string) {
    return this.cruisesService.getDeckMap(slug);
  }

  @ApiBearerAuth()
  @Roles(RoleKey.ORGANIZER_ADMIN)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateCruiseSchema)) body: CreateCruiseInput,
  ) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN);
    return this.cruisesService.create(organizerId, body);
  }

  @ApiBearerAuth()
  @Roles(RoleKey.ORGANIZER_ADMIN)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateCruiseSchema)) body: UpdateCruiseInput,
  ) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN);
    return this.cruisesService.update(organizerId, id, body);
  }

  @ApiBearerAuth()
  @Roles(RoleKey.ORGANIZER_ADMIN)
  @Post(':id/pricing')
  setCabinPricing(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(SetCruiseCabinPricingSchema)) body: SetCruiseCabinPricingInput,
  ) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN);
    return this.cruisesService.setCabinPricing(organizerId, id, body);
  }

  @ApiBearerAuth()
  @Roles(RoleKey.ORGANIZER_ADMIN)
  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  publish(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN);
    return this.cruisesService.publish(organizerId, id);
  }

  @ApiBearerAuth()
  @Roles(RoleKey.ORGANIZER_ADMIN)
  @Post(':id/unpublish')
  @HttpCode(HttpStatus.OK)
  unpublish(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN);
    return this.cruisesService.unpublish(organizerId, id);
  }
}
