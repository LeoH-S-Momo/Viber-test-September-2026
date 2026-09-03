import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleKey } from '@prisma/client';
import {
  CreateEventSchema,
  EventQuerySchema,
  UpdateEventSchema,
  type CreateEventInput,
  type EventQuery,
  type UpdateEventInput,
} from '@seapass/contracts';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { requireOrganizerId } from '../../../common/utils/auth-context';
import type { AuthenticatedUser } from '../../auth/types/jwt-payload';
import { EventsService } from '../application/events.service';

@ApiTags('catalog/events')
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Public()
  @Get()
  list(@Query(new ZodValidationPipe(EventQuerySchema)) query: EventQuery) {
    return this.eventsService.findMany(query);
  }

  @Public()
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.eventsService.findById(id);
  }

  @ApiBearerAuth()
  @Roles(RoleKey.ORGANIZER_ADMIN)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateEventSchema)) body: CreateEventInput,
  ) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN);
    return this.eventsService.create(organizerId, body);
  }

  @ApiBearerAuth()
  @Roles(RoleKey.ORGANIZER_ADMIN)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateEventSchema)) body: UpdateEventInput,
  ) {
    const organizerId = requireOrganizerId(user, RoleKey.ORGANIZER_ADMIN);
    return this.eventsService.update(organizerId, id, body);
  }
}
