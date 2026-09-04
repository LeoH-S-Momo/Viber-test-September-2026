import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateExperienceInput, UpdateExperienceInput } from '@seapass/contracts';
import { AuditLogService } from '../../../audit/audit-log.service';
import { ExperiencesRepository } from '../persistence/experiences.repository';
import { CruisesService } from './cruises.service';

@Injectable()
export class ExperiencesService {
  constructor(
    private readonly experiencesRepository: ExperiencesRepository,
    private readonly cruisesService: CruisesService,
    private readonly auditLog: AuditLogService,
  ) {}

  findByCruise(cruiseId: string) {
    return this.experiencesRepository.findByCruise(cruiseId);
  }

  async findManyForOrganizer(organizerId: string, cruiseId?: string) {
    if (cruiseId) {
      await this.cruisesService.findByIdForOrganizer(organizerId, cruiseId);
    }
    return this.experiencesRepository.findManyForOrganizer(organizerId, cruiseId);
  }

  async findById(id: string) {
    const experience = await this.experiencesRepository.findById(id);
    if (!experience) {
      throw new NotFoundException('Experiencia nao encontrada.');
    }
    return experience;
  }

  async create(organizerId: string, input: CreateExperienceInput, actorUserId?: string) {
    await this.cruisesService.findByIdForOrganizer(organizerId, input.cruiseId);
    const experience = await this.experiencesRepository.create(input);
    await this.auditLog.record({
      actorUserId: actorUserId ?? null,
      action: 'experience.created',
      entityType: 'Experience',
      entityId: experience.id,
      metadata: { title: experience.title, cruiseId: input.cruiseId },
    });
    return experience;
  }

  async update(organizerId: string, id: string, input: UpdateExperienceInput, actorUserId?: string) {
    const experience = await this.findById(id);
    await this.cruisesService.findByIdForOrganizer(organizerId, experience.cruise.id);
    const updated = await this.experiencesRepository.update(id, input);
    await this.auditLog.record({
      actorUserId: actorUserId ?? null,
      action: 'experience.updated',
      entityType: 'Experience',
      entityId: id,
      metadata: input,
    });
    return updated;
  }
}
