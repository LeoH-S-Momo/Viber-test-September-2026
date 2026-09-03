import { Injectable } from '@nestjs/common';
import type { CreateExperienceInput, UpdateExperienceInput } from '@seapass/contracts';
import { PrismaService } from '../../../database/prisma/prisma.service';

@Injectable()
export class ExperiencesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByCruise(cruiseId: string) {
    return this.prisma.experience.findMany({ where: { cruiseId }, orderBy: { title: 'asc' } });
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
