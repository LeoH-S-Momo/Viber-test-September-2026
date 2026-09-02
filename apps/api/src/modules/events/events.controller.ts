import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleKey } from '@prisma/client';
import { CreateEventSchema, type CreateEventInput } from '@seapass/contracts';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { requireOrganizerId } from '../../common/utils/auth-context';
import type { AuthenticatedUser } from '../auth/types/jwt-payload';
import { EventsService } from './events.service';

@ApiTags('events')
@ApiBearerAuth()
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Roles(RoleKey.ORGANIZER_ADMIN)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateEventSchema)) body: CreateEventInput,
  ) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN);
    return this.eventsService.create(organizerId, body);
  }
}
