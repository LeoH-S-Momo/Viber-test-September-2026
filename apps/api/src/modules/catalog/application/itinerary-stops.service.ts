import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateItineraryStopInput, UpdateItineraryStopInput } from '@seapass/contracts';
import { ItineraryStopsRepository } from '../persistence/itinerary-stops.repository';
import { CruisesService } from './cruises.service';

@Injectable()
export class ItineraryStopsService {
  constructor(
    private readonly itineraryStopsRepository: ItineraryStopsRepository,
    private readonly cruisesService: CruisesService,
  ) {}

  findByCruise(cruiseId: string) {
    return this.itineraryStopsRepository.findByCruise(cruiseId);
  }

  async create(organizerId: string, cruiseId: string, input: CreateItineraryStopInput) {
    await this.cruisesService.findByIdForOrganizer(organizerId, cruiseId);
    return this.itineraryStopsRepository.create(cruiseId, input);
  }

  async update(organizerId: string, id: string, input: UpdateItineraryStopInput) {
    const stop = await this.itineraryStopsRepository.findById(id);
    if (!stop) {
      throw new NotFoundException('Escala do itinerario nao encontrada.');
    }
    await this.cruisesService.findByIdForOrganizer(organizerId, stop.cruiseId);
    return this.itineraryStopsRepository.update(id, input);
  }
}
