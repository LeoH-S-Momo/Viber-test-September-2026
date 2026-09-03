import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleKey } from '@prisma/client';
import {
  CreateCabinSchema,
  UpdateCabinSchema,
  type CreateCabinInput,
  type UpdateCabinInput,
} from '@seapass/contracts';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { requireOrganizerId } from '../../../common/utils/auth-context';
import type { AuthenticatedUser } from '../../auth/types/jwt-payload';
import { CabinsService } from '../application/cabins.service';

@ApiTags('catalog/cabins')
@Controller()
export class CabinsController {
  constructor(private readonly cabinsService: CabinsService) {}

  @Public()
  @Get('decks/:deckId/cabins')
  list(@Param('deckId') deckId: string) {
    return this.cabinsService.findByDeck(deckId);
  }

  @ApiBearerAuth()
  @Roles(RoleKey.ORGANIZER_ADMIN)
  @Post('decks/:deckId/cabins')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('deckId') deckId: string,
    @Body(new ZodValidationPipe(CreateCabinSchema)) body: CreateCabinInput,
  ) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN);
    return this.cabinsService.create(organizerId, deckId, body);
  }

  @ApiBearerAuth()
  @Roles(RoleKey.ORGANIZER_ADMIN)
  @Patch('cabins/:id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateCabinSchema)) body: UpdateCabinInput,
  ) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN);
    return this.cabinsService.update(organizerId, id, body);
  }
}
