import { Injectable } from '@nestjs/common';
import type { CreateCabinInput, UpdateCabinInput } from '@seapass/contracts';
import { PrismaService } from '../../../database/prisma/prisma.service';

@Injectable()
export class CabinsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByDeck(deckId: string) {
    return this.prisma.cabin.findMany({
      where: { deckId },
      orderBy: { code: 'asc' },
      include: { cabinCategory: true },
    });
  }

  findById(id: string) {
    return this.prisma.cabin.findUnique({ where: { id }, include: { cabinCategory: true, deck: true } });
  }

  create(deckId: string, input: CreateCabinInput) {
    return this.prisma.cabin.create({ data: { ...input, deckId } });
  }

  update(id: string, input: UpdateCabinInput) {
    return this.prisma.cabin.update({ where: { id }, data: input });
  }
}
