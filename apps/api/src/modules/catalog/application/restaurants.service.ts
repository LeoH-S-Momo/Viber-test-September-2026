import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateRestaurantInput, UpdateRestaurantInput } from '@seapass/contracts';
import { AuditLogService } from '../../../audit/audit-log.service';
import { RestaurantsRepository } from '../persistence/restaurants.repository';
import { DecksService } from './decks.service';
import { ShipsService } from './ships.service';

@Injectable()
export class RestaurantsService {
  constructor(
    private readonly restaurantsRepository: RestaurantsRepository,
    private readonly shipsService: ShipsService,
    private readonly decksService: DecksService,
    private readonly auditLog: AuditLogService,
  ) {}

  findByShip(shipId: string) {
    return this.restaurantsRepository.findByShip(shipId);
  }

  findManyForOrganizer(organizerId: string) {
    return this.restaurantsRepository.findManyForOrganizer(organizerId);
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

  async create(organizerId: string, shipId: string, input: CreateRestaurantInput, actorUserId?: string) {
    await this.shipsService.findOwnedByOrganizerOrThrow(organizerId, shipId);
    await this.assertDeckBelongsToShip(shipId, input.deckId);
    const restaurant = await this.restaurantsRepository.create(shipId, input);
    await this.auditLog.record({
      actorUserId: actorUserId ?? null,
      action: 'restaurant.created',
      entityType: 'Restaurant',
      entityId: restaurant.id,
      metadata: { name: restaurant.name, shipId },
    });
    return restaurant;
  }

  async update(organizerId: string, id: string, input: UpdateRestaurantInput, actorUserId?: string) {
    const restaurant = await this.findById(id);
    await this.shipsService.findOwnedByOrganizerOrThrow(organizerId, restaurant.shipId);
    await this.assertDeckBelongsToShip(restaurant.shipId, input.deckId);
    const updated = await this.restaurantsRepository.update(id, input);
    await this.auditLog.record({
      actorUserId: actorUserId ?? null,
      action: 'restaurant.updated',
      entityType: 'Restaurant',
      entityId: id,
      metadata: input,
    });
    return updated;
  }
}
