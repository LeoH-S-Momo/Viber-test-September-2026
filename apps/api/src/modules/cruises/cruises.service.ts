import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateCruiseInput, UpdateCruiseInput } from '@seapass/contracts';
import { PrismaService } from '../../database/prisma/prisma.service';
import { generateUniqueSlug } from '../../common/utils/slug';

const PUBLIC_CRUISE_INCLUDE = {
  ship: { select: { id: true, name: true } },
  organizer: { select: { id: true, name: true, slug: true } },
  embarkationPort: true,
  disembarkationPort: true,
  itineraryStops: { include: { port: true }, orderBy: { dayNumber: 'asc' as const } },
  cabinPricings: { include: { cabinCategory: true } },
  events: true,
  experiences: true,
} as const;

@Injectable()
export class CruisesService {
  constructor(private readonly prisma: PrismaService) {}

  listPublished() {
    return this.prisma.cruise.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { embarkationDate: 'asc' },
      select: {
        id: true,
        title: true,
        slug: true,
        theme: true,
        coverImageUrl: true,
        embarkationDate: true,
        disembarkationDate: true,
        ship: { select: { name: true } },
        organizer: { select: { name: true } },
      },
    });
  }

  async findBySlug(slug: string) {
    const cruise = await this.prisma.cruise.findUnique({
      where: { slug },
      include: PUBLIC_CRUISE_INCLUDE,
    });
    if (!cruise || cruise.status !== 'PUBLISHED') {
      throw new NotFoundException('Cruzeiro nao encontrado.');
    }
    return cruise;
  }

  async findByIdForOrganizer(organizerId: string, id: string) {
    const cruise = await this.prisma.cruise.findUnique({ where: { id } });
    if (!cruise || cruise.organizerId !== organizerId) {
      throw new NotFoundException('Cruzeiro nao encontrado.');
    }
    return cruise;
  }

  async create(organizerId: string, input: CreateCruiseInput) {
    const ship = await this.prisma.ship.findUnique({ where: { id: input.shipId } });
    if (!ship || ship.organizerId !== organizerId) {
      throw new ForbiddenException('Este navio nao pertence ao seu organizador.');
    }

    const slug = await generateUniqueSlug(
      input.title,
      async (candidate) => Boolean(await this.prisma.cruise.findUnique({ where: { slug: candidate } })),
    );

    return this.prisma.cruise.create({
      data: {
        organizerId,
        shipId: input.shipId,
        title: input.title,
        slug,
        theme: input.theme,
        description: input.description,
        embarkationDate: input.embarkationDate,
        disembarkationDate: input.disembarkationDate,
        embarkationPortId: input.embarkationPortId,
        disembarkationPortId: input.disembarkationPortId,
        status: 'DRAFT',
      },
    });
  }

  async update(organizerId: string, id: string, input: UpdateCruiseInput) {
    await this.findByIdForOrganizer(organizerId, id);

    return this.prisma.cruise.update({
      where: { id },
      data: {
        title: input.title,
        description: input.description,
        status: input.status,
      },
    });
  }
}
