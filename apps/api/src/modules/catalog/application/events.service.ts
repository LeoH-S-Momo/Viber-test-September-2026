import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateEventInput, EventQuery, UpdateEventInput } from '@seapass/contracts';
import { EventsRepository } from '../persistence/events.repository';
import { CruisesService } from './cruises.service';
import { VenuesService } from './venues.service';

@Injectable()
export class EventsService {
  constructor(
    private readonly eventsRepository: EventsRepository,
    private readonly cruisesService: CruisesService,
    private readonly venuesService: VenuesService,
  ) {}

  findMany(query: EventQuery) {
    return this.eventsRepository.findMany(query);
  }

  async findById(id: string) {
    const event = await this.eventsRepository.findById(id);
    if (!event) {
      throw new NotFoundException('Evento nao encontrado.');
    }
    return event;
  }

  async create(organizerId: string, input: CreateEventInput) {
    const cruise = await this.cruisesService.findByIdForOrganizer(organizerId, input.cruiseId);
    const venue = await this.venuesService.findById(input.venueId);
    if (venue.shipId !== cruise.shipId) {
      throw new NotFoundException('Espaco (venue) nao encontrado neste navio.');
    }
    return this.eventsRepository.create(input);
  }

  async update(organizerId: string, id: string, input: UpdateEventInput) {
    const event = await this.findById(id);
    await this.cruisesService.findByIdForOrganizer(organizerId, event.cruise.id);
    return this.eventsRepository.update(id, input);
  }
}
