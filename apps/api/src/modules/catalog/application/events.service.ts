import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateEventInput, EventQuery, UpdateEventInput } from '@seapass/contracts';
import { AuditLogService } from '../../../audit/audit-log.service';
import { EventsRepository } from '../persistence/events.repository';
import { CruisesService } from './cruises.service';
import { VenuesService } from './venues.service';

@Injectable()
export class EventsService {
  constructor(
    private readonly eventsRepository: EventsRepository,
    private readonly cruisesService: CruisesService,
    private readonly venuesService: VenuesService,
    private readonly auditLog: AuditLogService,
  ) {}

  findMany(query: EventQuery) {
    return this.eventsRepository.findMany(query);
  }

  async findManyForOrganizer(organizerId: string, cruiseId?: string) {
    if (cruiseId) {
      await this.cruisesService.findByIdForOrganizer(organizerId, cruiseId);
    }
    return this.eventsRepository.findManyForOrganizer(organizerId, cruiseId);
  }

  async findById(id: string) {
    const event = await this.eventsRepository.findById(id);
    if (!event) {
      throw new NotFoundException('Evento nao encontrado.');
    }
    return event;
  }

  async create(organizerId: string, input: CreateEventInput, actorUserId?: string) {
    const cruise = await this.cruisesService.findByIdForOrganizer(organizerId, input.cruiseId);
    const venue = await this.venuesService.findById(input.venueId);
    if (venue.shipId !== cruise.shipId) {
      throw new NotFoundException('Espaco (venue) nao encontrado neste navio.');
    }
    const event = await this.eventsRepository.create(input);
    await this.auditLog.record({
      actorUserId: actorUserId ?? null,
      action: 'event.created',
      entityType: 'Event',
      entityId: event.id,
      metadata: { title: event.title, cruiseId: input.cruiseId },
    });
    return event;
  }

  async update(organizerId: string, id: string, input: UpdateEventInput, actorUserId?: string) {
    const event = await this.findById(id);
    await this.cruisesService.findByIdForOrganizer(organizerId, event.cruise.id);
    const updated = await this.eventsRepository.update(id, input);
    await this.auditLog.record({ actorUserId: actorUserId ?? null, action: 'event.updated', entityType: 'Event', entityId: id, metadata: input });
    return updated;
  }
}
