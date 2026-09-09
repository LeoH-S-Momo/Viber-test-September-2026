import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';

@Injectable()
export class WebhookEventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEventId(eventId: string) {
    return this.prisma.webhookEvent.findUnique({ where: { eventId } });
  }

  create(data: { provider: string; eventId: string; payload: Prisma.InputJsonValue }) {
    return this.prisma.webhookEvent.create({ data });
  }

  markProcessed(eventId: string) {
    return this.prisma.webhookEvent.update({ where: { eventId }, data: { processedAt: new Date() } });
  }

  markError(eventId: string, error: string) {
    return this.prisma.webhookEvent.update({ where: { eventId }, data: { processingError: error.slice(0, 500) } });
  }
}
