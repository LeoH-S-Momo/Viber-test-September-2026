import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateCabinCategoryInput, UpdateCabinCategoryInput } from '@seapass/contracts';
import { generateUniqueSlug } from '../../../common/utils/slug';
import { CabinCategoriesRepository } from '../persistence/cabin-categories.repository';
import { ShipsService } from './ships.service';

@Injectable()
export class CabinCategoriesService {
  constructor(
    private readonly cabinCategoriesRepository: CabinCategoriesRepository,
    private readonly shipsService: ShipsService,
  ) {}

  findByShip(shipId: string) {
    return this.cabinCategoriesRepository.findByShip(shipId);
  }

  async findById(id: string) {
    const category = await this.cabinCategoriesRepository.findById(id);
    if (!category) {
      throw new NotFoundException('Categoria de cabine nao encontrada.');
    }
    return category;
  }

  async create(organizerId: string, shipId: string, input: CreateCabinCategoryInput) {
    await this.shipsService.findOwnedByOrganizerOrThrow(organizerId, shipId);
    const slug = await generateUniqueSlug(input.name, (candidate) =>
      this.cabinCategoriesRepository.existsBySlug(shipId, candidate),
    );
    return this.cabinCategoriesRepository.create(shipId, slug, input);
  }

  async update(organizerId: string, id: string, input: UpdateCabinCategoryInput) {
    const category = await this.findById(id);
    await this.shipsService.findOwnedByOrganizerOrThrow(organizerId, category.shipId);
    return this.cabinCategoriesRepository.update(id, input);
  }
}
