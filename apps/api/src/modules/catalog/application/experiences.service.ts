import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateExperienceInput, UpdateExperienceInput } from '@seapass/contracts';
import { ExperiencesRepository } from '../persistence/experiences.repository';
import { CruisesService } from './cruises.service';

@Injectable()
export class ExperiencesService {
  constructor(
    private readonly experiencesRepository: ExperiencesRepository,
    private readonly cruisesService: CruisesService,
  ) {}

  findByCruise(cruiseId: string) {
    return this.experiencesRepository.findByCruise(cruiseId);
  }

  async findById(id: string) {
    const experience = await this.experiencesRepository.findById(id);
    if (!experience) {
      throw new NotFoundException('Experiencia nao encontrada.');
    }
    return experience;
  }

  async create(organizerId: string, input: CreateExperienceInput) {
    await this.cruisesService.findByIdForOrganizer(organizerId, input.cruiseId);
    return this.experiencesRepository.create(input);
  }

  async update(organizerId: string, id: string, input: UpdateExperienceInput) {
    const experience = await this.findById(id);
    await this.cruisesService.findByIdForOrganizer(organizerId, experience.cruise.id);
    return this.experiencesRepository.update(id, input);
  }
}
