import { Injectable } from '@nestjs/common';
import type { CreateDeckInput, UpdateDeckInput } from '@seapass/contracts';
import { PrismaService } from '../../../database/prisma/prisma.service';

@Injectable()
export class DecksRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByShip(shipId: string) {
    return this.prisma.deck.findMany({ where: { shipId }, orderBy: { number: 'asc' } });
  }

  /**
   * Planta completa de um navio: cada deck com suas cabines (+ categoria),
   * venues e restaurantes — a query de base do mapa interativo do navio.
   * Independente de cruzeiro: disponibilidade/preco (que sao por sailing) sao
   * cruzados depois, em CruisesService.getDeckMap.
   */
  findByShipWithLayout(shipId: string) {
    return this.prisma.deck.findMany({
      where: { shipId },
      orderBy: { number: 'asc' },
      include: {
        cabins: { orderBy: { code: 'asc' }, include: { cabinCategory: true } },
        venues: { orderBy: { name: 'asc' } },
        restaurants: { orderBy: { name: 'asc' } },
      },
    });
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
