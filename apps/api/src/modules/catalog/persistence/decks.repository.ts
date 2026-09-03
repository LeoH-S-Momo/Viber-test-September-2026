import { Injectable } from '@nestjs/common';
import type { CreateDeckInput, UpdateDeckInput } from '@seapass/contracts';
import { PrismaService } from '../../../database/prisma/prisma.service';

@Injectable()
export class DecksRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByShip(shipId: string) {
    return this.prisma.deck.findMany({ where: { shipId }, orderBy: { number: 'asc' } });
  }

  findById(id: string) {
    return this.prisma.deck.findUnique({ where: { id } });
  }

  create(shipId: string, input: CreateDeckInput) {
    return this.prisma.deck.create({ data: { ...input, shipId } });
  }

  update(id: string, input: UpdateDeckInput) {
    return this.prisma.deck.update({ where: { id }, data: input });
  }
}
