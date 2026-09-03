import { Injectable } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import type { CreateCabinInput, UpdateCabinInput } from '@seapass/contracts';
import { PrismaService } from '../../../database/prisma/prisma.service';

@Injectable()
export class CabinsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reservas que hoje bloqueiam uma cabine PARA ESTE cruzeiro (PENDING com
   * hold ainda valido, ou CONFIRMED) — usado por CabinAvailabilityPolicy no
   * mapa do navio. CANCELLED/REFUNDED/COMPLETED nunca bloqueiam, por isso
   * ficam de fora do filtro.
   */
  findActiveBookingsForCruise(cruiseId: string) {
    return this.prisma.booking.findMany({
      where: { cruiseId, status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] } },
      select: { cabinId: true, status: true, holdExpiresAt: true },
    });
  }

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
