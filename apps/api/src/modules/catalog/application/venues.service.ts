import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateVenueInput, UpdateVenueInput } from '@seapass/contracts';
import { VenuesRepository } from '../persistence/venues.repository';
import { DecksService } from './decks.service';
import { ShipsService } from './ships.service';

@Injectable()
export class VenuesService {
  constructor(
    private readonly venuesRepository: VenuesRepository,
    private readonly shipsService: ShipsService,
    private readonly decksService: DecksService,
  ) {}

  findByShip(shipId: string) {
    return this.venuesRepository.findByShip(shipId);
  }

  async findById(id: string) {
    const venue = await this.venuesRepository.findById(id);
    if (!venue) {
      throw new NotFoundException('Espaco (venue) nao encontrado.');
    }
    return venue;
  }

  private async assertDeckBelongsToShip(shipId: string, deckId?: string) {
    if (!deckId) return;
    const deck = await this.decksService.findById(deckId);
    if (deck.shipId !== shipId) {
      throw new ConflictException('O deck informado nao pertence a este navio.');
    }
  }

  async create(organizerId: string, shipId: string, input: CreateVenueInput) {
    await this.shipsService.findOwnedByOrganizerOrThrow(organizerId, shipId);
    await this.assertDeckBelongsToShip(shipId, input.deckId);
    return this.venuesRepository.create(shipId, input);
  }

  async update(organizerId: string, id: string, input: UpdateVenueInput) {
    const venue = await this.findById(id);
    await this.shipsService.findOwnedByOrganizerOrThrow(organizerId, venue.shipId);
    await this.assertDeckBelongsToShip(venue.shipId, input.deckId);
    return this.venuesRepository.update(id, input);
  }
}
