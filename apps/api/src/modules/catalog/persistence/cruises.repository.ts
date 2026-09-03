import { Injectable } from '@nestjs/common';
import { CruiseStatus, type Prisma } from '@prisma/client';
import type {
  CreateCruiseInput,
  CruiseQuery,
  SetCruiseCabinPricingInput,
  UpdateCruiseInput,
} from '@seapass/contracts';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { toSkipTake } from '../domain/pagination';

export const CRUISE_DETAIL_INCLUDE = {
  ship: { select: { id: true, name: true, passengerCapacity: true } },
  organizer: { select: { id: true, name: true, slug: true } },
  embarkationPort: true,
  disembarkationPort: true,
  itineraryStops: { include: { port: true }, orderBy: { dayNumber: 'asc' as const } },
  cabinPricings: { include: { cabinCategory: true } },
  events: { include: { venue: true, artist: true } },
  experiences: true,
} as const;

const CRUISE_SUMMARY_SELECT = {
  id: true,
  title: true,
  slug: true,
  theme: true,
  status: true,
  coverImageUrl: true,
  embarkationDate: true,
  disembarkationDate: true,
  ship: { select: { name: true } },
  organizer: { select: { id: true, name: true } },
  embarkationPort: { select: { name: true, country: true } },
  cabinPricings: { select: { price: true } },
} as const;

type CruiseSummary = Prisma.CruiseGetPayload<{ select: typeof CRUISE_SUMMARY_SELECT }>;

@Injectable()
export class CruisesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Filtros que vivem no proprio Cruise (sem o preco — ver `priceFilter`). */
  private buildCruiseWhere(
    query: CruiseQuery,
    forcedStatus?: CruiseStatus,
  ): Prisma.CruiseWhereInput {
    const where: Prisma.CruiseWhereInput = {
      status: forcedStatus ?? query.status,
      organizerId: query.organizerId,
      theme: query.theme ? { contains: query.theme, mode: 'insensitive' } : undefined,
    };

    if (query.embarkationFrom || query.embarkationTo) {
      where.embarkationDate = { gte: query.embarkationFrom, lte: query.embarkationTo };
    }

    if (query.destination) {
      where.OR = [
        { embarkationPort: { name: { contains: query.destination, mode: 'insensitive' } } },
        {
          itineraryStops: {
            some: { port: { name: { contains: query.destination, mode: 'insensitive' } } },
          },
        },
      ];
    }

    return where;
  }

  private priceFilter(query: CruiseQuery): Prisma.DecimalFilter | undefined {
    if (query.minPrice === undefined && query.maxPrice === undefined) {
      return undefined;
    }
    return { gte: query.minPrice, lte: query.maxPrice };
  }

  async findMany(query: CruiseQuery, forcedStatus?: CruiseStatus) {
    const cruiseWhere = this.buildCruiseWhere(query, forcedStatus);
    const price = this.priceFilter(query);
    const fullWhere: Prisma.CruiseWhereInput = {
      ...cruiseWhere,
      cabinPricings: price ? { some: { price } } : undefined,
    };

    const total = await this.prisma.cruise.count({ where: fullWhere });
    const { skip, take } = toSkipTake(query.page, query.pageSize);

    if (query.sortBy !== 'price') {
      const data = await this.prisma.cruise.findMany({
        where: fullWhere,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip,
        take,
        select: CRUISE_SUMMARY_SELECT,
      });
      return { data, total };
    }

    // Prisma nao suporta `orderBy` por `_min`/`_max` de uma relacao 1:N em
    // `findMany` (so `_count`) — precisa de `groupBy` (que suporta orderBy
    // por aggregate) + uma segunda consulta preservando a ordem dos ids.
    const grouped = await this.prisma.cruiseCabinPricing.groupBy({
      by: ['cruiseId'],
      where: { cruise: cruiseWhere, price },
      _min: { price: true },
      orderBy: { _min: { price: query.sortOrder } },
      skip,
      take,
    });

    const orderedIds = grouped.map((g) => g.cruiseId);
    if (orderedIds.length === 0) {
      return { data: [] as CruiseSummary[], total };
    }

    const rows = await this.prisma.cruise.findMany({
      where: { id: { in: orderedIds } },
      select: CRUISE_SUMMARY_SELECT,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const data = orderedIds
      .map((id) => byId.get(id))
      .filter((row): row is CruiseSummary => Boolean(row));

    return { data, total };
  }

  findBySlug(slug: string) {
    return this.prisma.cruise.findUnique({ where: { slug }, include: CRUISE_DETAIL_INCLUDE });
  }

  findById(id: string) {
    return this.prisma.cruise.findUnique({ where: { id } });
  }

  findPublishReadiness(id: string) {
    return this.prisma.cruise.findUnique({
      where: { id },
      include: { _count: { select: { itineraryStops: true, cabinPricings: true } } },
    });
  }

  create(organizerId: string, slug: string, input: CreateCruiseInput) {
    return this.prisma.cruise.create({
      data: { ...input, organizerId, slug, status: CruiseStatus.DRAFT },
    });
  }

  update(id: string, input: UpdateCruiseInput) {
    return this.prisma.cruise.update({ where: { id }, data: input });
  }

  updateStatus(id: string, status: CruiseStatus) {
    return this.prisma.cruise.update({ where: { id }, data: { status } });
  }

  existsBySlug(slug: string) {
    return this.prisma.cruise.findUnique({ where: { slug } }).then(Boolean);
  }

  setCabinPricing(cruiseId: string, input: SetCruiseCabinPricingInput) {
    return this.prisma.cruiseCabinPricing.upsert({
      where: {
        cruiseId_cabinCategoryId: { cruiseId, cabinCategoryId: input.cabinCategoryId },
      },
      update: {
        price: input.price,
        currency: input.currency,
        cancellationPolicy: input.cancellationPolicy,
      },
      create: { cruiseId, ...input },
      include: { cabinCategory: true },
    });
  }
}
