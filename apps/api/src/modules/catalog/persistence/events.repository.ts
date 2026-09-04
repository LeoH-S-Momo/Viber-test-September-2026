import { Injectable } from '@nestjs/common';
import type { CreateEventInput, EventQuery, UpdateEventInput } from '@seapass/contracts';
import { PrismaService } from '../../../database/prisma/prisma.service';

@Injectable()
export class EventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(query: EventQuery) {
    return this.prisma.event.findMany({
      where: { cruiseId: query.cruiseId, category: query.category },
      orderBy: { startAt: 'asc' },
      include: { venue: true, artist: true },
    });
  }

  /** Painel do organizador — SEMPRE filtra por `cruise.organizerId`, nunca so por `cruiseId` (ver ADR-0016). */
  findManyForOrganizer(organizerId: string, cruiseId?: string) {
    return this.prisma.event.findMany({
      where: { cruise: { organizerId }, ...(cruiseId ? { cruiseId } : {}) },
      orderBy: { startAt: 'asc' },
      include: { venue: true, artist: true, cruise: { select: { id: true, title: true } } },
    });
  }

  findById(id: string) {
    return this.prisma.event.findUnique({
      where: { id },
      include: { venue: true, artist: true, cruise: { select: { id: true, organizerId: true } } },
    });
  }

  create(input: CreateEventInput) {
    return this.prisma.event.create({ data: input });
  }

  update(id: string, input: UpdateEventInput) {
    return this.prisma.event.update({ where: { id }, data: input });
  }
}
