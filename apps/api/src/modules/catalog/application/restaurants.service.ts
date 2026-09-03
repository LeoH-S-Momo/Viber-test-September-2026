import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateRestaurantInput, UpdateRestaurantInput } from '@seapass/contracts';
import { RestaurantsRepository } from '../persistence/restaurants.repository';
import { DecksService } from './decks.service';
import { ShipsService } from './ships.service';

@Injectable()
export class RestaurantsService {
  constructor(
    private readonly restaurantsRepository: RestaurantsRepository,
    private readonly shipsService: ShipsService,
    private readonly decksService: DecksService,
  ) {}

  findByShip(shipId: string) {
    return this.restaurantsRepository.findByShip(shipId);
  }

  async findById(id: string) {
    const restaurant = await this.restaurantsRepository.findById(id);
    if (!restaurant) {
      throw new NotFoundException('Restaurante nao encontrado.');
    }
    return restaurant;
  }

  private async assertDeckBelongsToShip(shipId: string, deckId?: string) {
    if (!deckId) return;
    const deck = await this.decksService.findById(deckId);
    if (deck.shipId !== shipId) {
      throw new ConflictException('O deck informado nao pertence a este navio.');
    }
  }

  async create(organizerId: string, shipId: string, input: CreateRestaurantInput) {
    await this.shipsService.findOwnedByOrganizerOrThrow(organizerId, shipId);
    await this.assertDeckBelongsToShip(shipId, input.deckId);
    return this.restaurantsRepository.create(shipId, input);
  }

  async update(organizerId: string, id: string, input: UpdateRestaurantInput) {
    const restaurant = await this.findById(id);
    await this.shipsService.findOwnedByOrganizerOrThrow(organizerId, restaurant.shipId);
    await this.assertDeckBelongsToShip(restaurant.shipId, input.deckId);
    return this.restaurantsRepository.update(id, input);
  }
}
