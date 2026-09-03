import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleKey } from '@prisma/client';
import {
  CreateDeckSchema,
  UpdateDeckSchema,
  type CreateDeckInput,
  type UpdateDeckInput,
} from '@seapass/contracts';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { requireOrganizerId } from '../../../common/utils/auth-context';
import type { AuthenticatedUser } from '../../auth/types/jwt-payload';
import { DecksService } from '../application/decks.service';

@ApiTags('catalog/decks')
@Controller()
export class DecksController {
  constructor(private readonly decksService: DecksService) {}

  @Public()
  @Get('ships/:shipId/decks')
  list(@Param('shipId') shipId: string) {
    return this.decksService.findByShip(shipId);
  }

  @ApiBearerAuth()
  @Roles(RoleKey.ORGANIZER_ADMIN)
  @Post('ships/:shipId/decks')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shipId') shipId: string,
    @Body(new ZodValidationPipe(CreateDeckSchema)) body: CreateDeckInput,
  ) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN);
    return this.decksService.create(organizerId, shipId, body);
  }

  @ApiBearerAuth()
  @Roles(RoleKey.ORGANIZER_ADMIN)
  @Patch('decks/:id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateDeckSchema)) body: UpdateDeckInput,
  ) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN);
    return this.decksService.update(organizerId, id, body);
  }
}
