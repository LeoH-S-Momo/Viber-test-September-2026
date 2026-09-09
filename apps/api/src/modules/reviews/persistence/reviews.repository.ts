import { Injectable } from '@nestjs/common';
import { Prisma, ReviewStatus } from '@prisma/client';
import { toSkipTake } from '../../catalog/domain/pagination';
import { PrismaService } from '../../../database/prisma/prisma.service';

const MODERATION_INCLUDE = {
  booking: { select: { user: { select: { fullName: true } } } },
  cruise: { select: { title: true, slug: true, organizerId: true } },
} satisfies Prisma.ReviewInclude;

export type ReviewWithModerationContext = Prisma.ReviewGetPayload<{ include: typeof MODERATION_INCLUDE }>;

@Injectable()
export class ReviewsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Usado tanto pela elegibilidade (criar) quanto pra devolver o status pro passageiro (GET). */
  findBookingForReview(bookingId: string) {
    return this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        userId: true,
        status: true,
        cruiseId: true,
        cruise: { select: { disembarkationDate: true } },
        review: true,
      },
    });
  }

  create(data: { bookingId: string; userId: string; cruiseId: string; rating: number; comment?: string }) {
    return this.prisma.review.create({ data });
  }

  findByBookingId(bookingId: string) {
    return this.prisma.review.findUnique({ where: { bookingId } });
  }

  findByIdForModeration(id: string): Promise<ReviewWithModerationContext | null> {
    return this.prisma.review.findUnique({ where: { id }, include: MODERATION_INCLUDE });
  }

  /** Somente APPROVED — o que a pagina publica do cruzeiro mostra (ver ADR-0005: nao expor moderacao pendente/rejeitada). */
  async findApprovedByCruiseSlug(slug: string, page: number, pageSize: number) {
    const cruise = await this.prisma.cruise.findUnique({ where: { slug }, select: { id: true } });
    if (!cruise) {
      return { reviews: [], total: 0, averageRating: null };
    }
    const where: Prisma.ReviewWhereInput = { cruiseId: cruise.id, status: ReviewStatus.APPROVED };
    const { skip, take } = toSkipTake(page, pageSize);
    const [reviews, total, aggregate] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { booking: { select: { user: { select: { fullName: true } } } } },
      }),
      this.prisma.review.count({ where }),
      this.prisma.review.aggregate({ where, _avg: { rating: true } }),
    ]);
    return { reviews, total, averageRating: aggregate._avg.rating };
  }

  /** Escopado por organizador via a relacao `cruise` (sem denormalizar organizerId no Review). */
  findForModeration(organizerId: string, status: ReviewStatus | undefined, page: number, pageSize: number) {
    const where: Prisma.ReviewWhereInput = { cruise: { organizerId }, ...(status ? { status } : {}) };
    const { skip, take } = toSkipTake(page, pageSize);
    return Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: MODERATION_INCLUDE,
      }),
      this.prisma.review.count({ where }),
    ]);
  }

  updateStatus(id: string, status: ReviewStatus, moderatedByUserId: string, note?: string) {
    return this.prisma.review.update({
      where: { id },
      data: { status, moderatedByUserId, moderationNote: note ?? null, moderatedAt: new Date() },
    });
  }
}
