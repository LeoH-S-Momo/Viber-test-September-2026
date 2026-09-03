import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleKey } from '@prisma/client';
import {
  CreateCabinCategorySchema,
  UpdateCabinCategorySchema,
  type CreateCabinCategoryInput,
  type UpdateCabinCategoryInput,
} from '@seapass/contracts';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { requireOrganizerId } from '../../../common/utils/auth-context';
import type { AuthenticatedUser } from '../../auth/types/jwt-payload';
import { CabinCategoriesService } from '../application/cabin-categories.service';

@ApiTags('catalog/cabin-categories')
@Controller()
export class CabinCategoriesController {
  constructor(private readonly cabinCategoriesService: CabinCategoriesService) {}

  @Public()
  @Get('ships/:shipId/cabin-categories')
  list(@Param('shipId') shipId: string) {
    return this.cabinCategoriesService.findByShip(shipId);
  }

  @ApiBearerAuth()
  @Roles(RoleKey.ORGANIZER_ADMIN)
  @Post('ships/:shipId/cabin-categories')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shipId') shipId: string,
    @Body(new ZodValidationPipe(CreateCabinCategorySchema)) body: CreateCabinCategoryInput,
  ) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN);
    return this.cabinCategoriesService.create(organizerId, shipId, body);
  }

  @ApiBearerAuth()
  @Roles(RoleKey.ORGANIZER_ADMIN)
  @Patch('cabin-categories/:id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateCabinCategorySchema)) body: UpdateCabinCategoryInput,
  ) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN);
    return this.cabinCategoriesService.update(organizerId, id, body);
  }
}
