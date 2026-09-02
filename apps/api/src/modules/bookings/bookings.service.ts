import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService) {}

  findMine(userId: string) {
    return this.prisma.booking.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        cruise: { select: { id: true, title: true, slug: true, embarkationDate: true } },
        cabin: { select: { id: true, code: true, cabinCategory: { select: { name: true } } } },
        guests: true,
      },
    });
  }
}
