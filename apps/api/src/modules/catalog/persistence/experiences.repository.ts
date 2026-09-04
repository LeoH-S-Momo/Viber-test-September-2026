import { Injectable } from '@nestjs/common';
import type { CreateExperienceInput, UpdateExperienceInput } from '@seapass/contracts';
import { PrismaService } from '../../../database/prisma/prisma.service';

@Injectable()
export class ExperiencesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByCruise(cruiseId: string) {
    return this.prisma.experience.findMany({ where: { cruiseId }, orderBy: { title: 'asc' } });
  }

  /** Painel do organizador — SEMPRE filtra por `cruise.organizerId` (ver ADR-0016). */
  findManyForOrganizer(organizerId: string, cruiseId?: string) {
    return this.prisma.experience.findMany({
      where: { cruise: { organizerId }, ...(cruiseId ? { cruiseId } : {}) },
      orderBy: { title: 'asc' },
      include: { cruise: { select: { id: true, title: true } } },
    });
  }

  findById(id: string) {
    return this.prisma.experience.findUnique({
      where: { id },
      include: { cruise: { select: { id: true, organizerId: true } } },
    });
  }

  create(input: CreateExperienceInput) {
    return this.prisma.experience.create({ data: input });
  }

  update(id: string, input: UpdateExperienceInput) {
    return this.prisma.experience.update({ where: { id }, data: input });
  }
}
