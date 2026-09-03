import { Injectable } from '@nestjs/common';
import type { CreateVenueInput, UpdateVenueInput } from '@seapass/contracts';
import { PrismaService } from '../../../database/prisma/prisma.service';

@Injectable()
export class VenuesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByShip(shipId: string) {
    return this.prisma.venue.findMany({ where: { shipId }, orderBy: { name: 'asc' } });
  }

  findById(id: string) {
    return this.prisma.venue.findUnique({ where: { id } });
  }

  create(shipId: string, input: CreateVenueInput) {
    return this.prisma.venue.create({ data: { ...input, shipId } });
  }

  update(id: string, input: UpdateVenueInput) {
    return this.prisma.venue.update({ where: { id }, data: input });
  }
}
