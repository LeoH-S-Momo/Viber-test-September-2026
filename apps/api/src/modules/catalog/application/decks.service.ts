import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateDeckInput, UpdateDeckInput } from '@seapass/contracts';
import { DecksRepository } from '../persistence/decks.repository';
import { ShipsService } from './ships.service';

@Injectable()
export class DecksService {
  constructor(
    private readonly decksRepository: DecksRepository,
    private readonly shipsService: ShipsService,
  ) {}

  findByShip(shipId: string) {
    return this.decksRepository.findByShip(shipId);
  }

  async findById(id: string) {
    const deck = await this.decksRepository.findById(id);
    if (!deck) {
      throw new NotFoundException('Deck nao encontrado.');
    }
    return deck;
  }

  /** Usado por outros services do catalogo (ex: Cabins) para checar posse sem duplicar a query. */
  async findOwnedByOrganizerOrThrow(organizerId: string, id: string) {
    const deck = await this.findById(id);
    await this.shipsService.findOwnedByOrganizerOrThrow(organizerId, deck.shipId);
    return deck;
  }

  async create(organizerId: string, shipId: string, input: CreateDeckInput) {
    await this.shipsService.findOwnedByOrganizerOrThrow(organizerId, shipId);
    return this.decksRepository.create(shipId, input);
  }

  async update(organizerId: string, id: string, input: UpdateDeckInput) {
    await this.findOwnedByOrganizerOrThrow(organizerId, id);
    return this.decksRepository.update(id, input);
  }
}
