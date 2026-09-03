import { Injectable } from '@nestjs/common';
import type { CreateCabinCategoryInput, UpdateCabinCategoryInput } from '@seapass/contracts';
import { PrismaService } from '../../../database/prisma/prisma.service';

@Injectable()
export class CabinCategoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByShip(shipId: string) {
    return this.prisma.cabinCategory.findMany({ where: { shipId }, orderBy: { name: 'asc' } });
  }

  findById(id: string) {
    return this.prisma.cabinCategory.findUnique({ where: { id } });
  }

  create(shipId: string, slug: string, input: CreateCabinCategoryInput) {
    return this.prisma.cabinCategory.create({ data: { ...input, shipId, slug } });
  }

  update(id: string, input: UpdateCabinCategoryInput) {
    return this.prisma.cabinCategory.update({ where: { id }, data: input });
  }

  existsBySlug(shipId: string, slug: string) {
    return this.prisma.cabinCategory
      .findUnique({ where: { shipId_slug: { shipId, slug } } })
      .then(Boolean);
  }
}
