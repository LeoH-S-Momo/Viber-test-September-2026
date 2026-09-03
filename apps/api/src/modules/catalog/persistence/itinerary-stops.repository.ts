import { Injectable } from '@nestjs/common';
import type { CreateItineraryStopInput, UpdateItineraryStopInput } from '@seapass/contracts';
import { PrismaService } from '../../../database/prisma/prisma.service';

@Injectable()
export class ItineraryStopsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByCruise(cruiseId: string) {
    return this.prisma.itineraryStop.findMany({
      where: { cruiseId },
      orderBy: { dayNumber: 'asc' },
      include: { port: true },
    });
  }

  findById(id: string) {
    return this.prisma.itineraryStop.findUnique({ where: { id } });
  }

  count(cruiseId: string) {
    return this.prisma.itineraryStop.count({ where: { cruiseId } });
  }

  create(cruiseId: string, input: CreateItineraryStopInput) {
    return this.prisma.itineraryStop.create({ data: { ...input, cruiseId } });
  }

  update(id: string, input: UpdateItineraryStopInput) {
    return this.prisma.itineraryStop.update({ where: { id }, data: input });
  }
}
