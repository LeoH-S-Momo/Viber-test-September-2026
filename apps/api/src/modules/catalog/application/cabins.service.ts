import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateCabinInput, UpdateCabinInput } from '@seapass/contracts';
import { CabinsRepository } from '../persistence/cabins.repository';
import { CabinCategoriesService } from './cabin-categories.service';
import { DecksService } from './decks.service';

@Injectable()
export class CabinsService {
  constructor(
    private readonly cabinsRepository: CabinsRepository,
    private readonly decksService: DecksService,
    private readonly cabinCategoriesService: CabinCategoriesService,
  ) {}

  findByDeck(deckId: string) {
    return this.cabinsRepository.findByDeck(deckId);
  }

  async findById(id: string) {
    const cabin = await this.cabinsRepository.findById(id);
    if (!cabin) {
      throw new NotFoundException('Cabine nao encontrada.');
    }
    return cabin;
  }

  async create(organizerId: string, deckId: string, input: CreateCabinInput) {
    const deck = await this.decksService.findOwnedByOrganizerOrThrow(organizerId, deckId);
    const category = await this.cabinCategoriesService.findById(input.cabinCategoryId);
    if (category.shipId !== deck.shipId) {
      throw new ConflictException(
        'A categoria de cabine informada nao pertence ao navio deste deck.',
      );
    }
    return this.cabinsRepository.create(deckId, input);
  }

  async update(organizerId: string, id: string, input: UpdateCabinInput) {
    const cabin = await this.findById(id);
    await this.decksService.findOwnedByOrganizerOrThrow(organizerId, cabin.deckId);
    return this.cabinsRepository.update(id, input);
  }
}
