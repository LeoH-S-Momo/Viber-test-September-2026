import { Injectable } from '@nestjs/common';
import type { CreateShipInput, UpdateShipInput } from '@seapass/contracts';
import { PrismaService } from '../../../database/prisma/prisma.service';

@Injectable()
export class ShipsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(organizerId?: string) {
    return this.prisma.ship.findMany({
      where: { organizerId, deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  findById(id: string) {
    return this.prisma.ship.findUnique({ where: { id } });
  }

  create(organizerId: string, input: CreateShipInput) {
    return this.prisma.ship.create({ data: { ...input, organizerId } });
  }

  update(id: string, input: UpdateShipInput) {
    return this.prisma.ship.update({ where: { id }, data: input });
  }
}
