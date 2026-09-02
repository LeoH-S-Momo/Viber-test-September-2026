import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateEventInput } from '@seapass/contracts';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizerId: string, input: CreateEventInput) {
    const cruise = await this.prisma.cruise.findUnique({ where: { id: input.cruiseId } });
    if (!cruise) {
      throw new NotFoundException('Cruzeiro nao encontrado.');
    }
    if (cruise.organizerId !== organizerId) {
      throw new ForbiddenException('Este cruzeiro nao pertence ao seu organizador.');
    }

    const venue = await this.prisma.venue.findUnique({ where: { id: input.venueId } });
    if (!venue || venue.shipId !== cruise.shipId) {
      throw new NotFoundException('Espaco (venue) nao encontrado neste navio.');
    }

    return this.prisma.event.create({
      data: {
        cruiseId: input.cruiseId,
        venueId: input.venueId,
        artistId: input.artistId,
        title: input.title,
        description: input.description,
        category: input.category,
        startAt: input.startAt,
        endAt: input.endAt,
        capacity: input.capacity,
        isIncluded: input.isIncluded,
        price: input.price,
      },
    });
  }
}
