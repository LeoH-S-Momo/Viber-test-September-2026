import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleKey } from '@prisma/client';
import {
  CreateCruiseSchema,
  UpdateCruiseSchema,
  type CreateCruiseInput,
  type UpdateCruiseInput,
} from '@seapass/contracts';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { requireOrganizerId } from '../../common/utils/auth-context';
import type { AuthenticatedUser } from '../auth/types/jwt-payload';
import { CruisesService } from './cruises.service';

@ApiTags('cruises')
@Controller('cruises')
export class CruisesController {
  constructor(private readonly cruisesService: CruisesService) {}

  @Public()
  @Get()
  list() {
    return this.cruisesService.listPublished();
  }

  @Public()
  @Get(':slug')
  detail(@Param('slug') slug: string) {
    return this.cruisesService.findBySlug(slug);
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
}
