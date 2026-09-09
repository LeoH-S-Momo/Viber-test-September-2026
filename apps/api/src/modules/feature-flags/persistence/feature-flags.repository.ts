import { Injectable } from '@nestjs/common';
import { FeatureFlagKey } from '@prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';

@Injectable()
export class FeatureFlagsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByOrganizer(organizerId: string) {
    return this.prisma.organizerFeatureFlag.findMany({ where: { organizerId } });
  }

  upsert(organizerId: string, key: FeatureFlagKey, enabled: boolean, actorUserId: string) {
    return this.prisma.organizerFeatureFlag.upsert({
      where: { organizerId_key: { organizerId, key } },
      update: { enabled, updatedByUserId: actorUserId },
      create: { organizerId, key, enabled, updatedByUserId: actorUserId },
    });
  }

  findOne(organizerId: string, key: FeatureFlagKey) {
    return this.prisma.organizerFeatureFlag.findUnique({ where: { organizerId_key: { organizerId, key } } });
  }
}
