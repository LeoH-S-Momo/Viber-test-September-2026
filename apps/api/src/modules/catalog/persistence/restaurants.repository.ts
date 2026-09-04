import { Injectable } from '@nestjs/common';
import type { CreateRestaurantInput, UpdateRestaurantInput } from '@seapass/contracts';
import { PrismaService } from '../../../database/prisma/prisma.service';

@Injectable()
export class RestaurantsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByShip(shipId: string) {
    return this.prisma.restaurant.findMany({
      where: { shipId },
      orderBy: { name: 'asc' },
      include: { diningSlots: true },
    });
  }

  /** Painel do organizador — todos os restaurantes de todos os navios do organizador (ver ADR-0016). */
  findManyForOrganizer(organizerId: string) {
    return this.prisma.restaurant.findMany({
      where: { ship: { organizerId } },
      orderBy: { name: 'asc' },
      include: { diningSlots: true, ship: { select: { id: true, name: true } } },
    });
  }

  findById(id: string) {
    return this.prisma.restaurant.findUnique({
      where: { id },
      include: { diningSlots: true },
    });
  }

  create(shipId: string, input: CreateRestaurantInput) {
    return this.prisma.restaurant.create({ data: { ...input, shipId } });
  }

  update(id: string, input: UpdateRestaurantInput) {
    return this.prisma.restaurant.update({ where: { id }, data: input });
  }
}
