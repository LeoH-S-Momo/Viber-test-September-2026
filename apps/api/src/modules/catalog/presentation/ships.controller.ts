import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleKey } from '@prisma/client';
import {
  CreateShipSchema,
  UpdateShipSchema,
  type CreateShipInput,
  type UpdateShipInput,
} from '@seapass/contracts';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { requireOrganizerId } from '../../../common/utils/auth-context';
import type { AuthenticatedUser } from '../../auth/types/jwt-payload';
import { ShipsService } from '../application/ships.service';

@ApiTags('catalog/ships')
@Controller('ships')
export class ShipsController {
  constructor(private readonly shipsService: ShipsService) {}

  @Public()
  @Get()
  list(@Query('organizerId') organizerId?: string) {
    return this.shipsService.findMany(organizerId);
  }

  @Public()
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.shipsService.findById(id);
  }

  @ApiBearerAuth()
  @Roles(RoleKey.ORGANIZER_ADMIN)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateShipSchema)) body: CreateShipInput,
  ) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN);
    return this.shipsService.create(organizerId, body);
  }

  @ApiBearerAuth()
  @Roles(RoleKey.ORGANIZER_ADMIN)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateShipSchema)) body: UpdateShipInput,
  ) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN);
    return this.shipsService.update(organizerId, id, body);
  }
}
