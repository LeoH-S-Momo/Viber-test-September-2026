import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ReviewStatus } from '@prisma/client';
import { DomainEvent } from '../../../domain-events/domain-events';
import { toPageResult } from '../../catalog/domain/pagination';
import { ReviewEligibilityPolicy } from '../domain/review-eligibility.policy';
import { ReviewModerationPolicy } from '../domain/review-moderation.policy';
import { ReviewsRepository } from '../persistence/reviews.repository';

export interface ReviewView {
  id: string;
  rating: number;
  comment: string | null;
  status: ReviewStatus;
  createdAt: Date;
  moderationNote: string | null;
}

@Injectable()
export class ReviewsService {
  constructor(
    private readonly reviewsRepository: ReviewsRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async getMine(bookingId: string, userId: string): Promise<ReviewView | null> {
    const booking = await this.reviewsRepository.findBookingForReview(bookingId);
    if (!booking) {
      throw new NotFoundException('Reserva nao encontrada.');
    }
    ReviewEligibilityPolicy.assertOwnership(booking, userId);
    return booking.review ? this.toView(booking.review) : null;
  }

  async submit(bookingId: string, userId: string, rating: number, comment?: string): Promise<ReviewView> {
    const booking = await this.reviewsRepository.findBookingForReview(bookingId);
    if (!booking) {
      throw new NotFoundException('Reserva nao encontrada.');
    }
    ReviewEligibilityPolicy.assertOwnership(booking, userId);
    ReviewEligibilityPolicy.assertEligible(booking, booking.cruise, booking.review !== null);

    const review = await this.reviewsRepository.create({
      bookingId,
      userId,
      cruiseId: booking.cruiseId,
      rating,
      comment,
    });
    this.eventEmitter.emit(DomainEvent.REVIEW_SUBMITTED, { reviewId: review.id, cruiseId: review.cruiseId });
    return this.toView(review);
  }

  async listApprovedForCruise(slug: string, page: number, pageSize: number) {
    const { reviews, total, averageRating } = await this.reviewsRepository.findApprovedByCruiseSlug(
      slug,
      page,
      pageSize,
    );
    const view = reviews.map((review) => ({
      id: review.id,
      rating: review.rating,
      comment: review.comment,
      createdAt: review.createdAt,
      passengerName: review.booking.user.fullName,
    }));
    return {
      ...toPageResult(view, total, page, pageSize),
      averageRating: averageRating ? Math.round(averageRating * 10) / 10 : null,
    };
  }

  async getHighlights(limit: number) {
    const { reviews, total, averageRating } = await this.reviewsRepository.findHighlights(limit);
    return {
      items: reviews.map((review) => ({
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        passengerName: review.booking.user.fullName,
        cruiseTitle: review.cruise.title,
        cruiseSlug: review.cruise.slug,
      })),
      total,
      averageRating: averageRating ? Math.round(averageRating * 10) / 10 : null,
    };
  }

  async listForModeration(organizerId: string, status: ReviewStatus | undefined, page: number, pageSize: number) {
    const [reviews, total] = await this.reviewsRepository.findForModeration(organizerId, status, page, pageSize);
    const view = reviews.map((review) => ({
      id: review.id,
      rating: review.rating,
      comment: review.comment,
      status: review.status,
      createdAt: review.createdAt,
      moderatedAt: review.moderatedAt,
      moderationNote: review.moderationNote,
      passengerName: review.booking.user.fullName,
      cruiseTitle: review.cruise.title,
    }));
    return toPageResult(view, total, page, pageSize);
  }

  async moderate(
    organizerId: string,
    reviewId: string,
    status: Exclude<ReviewStatus, 'PENDING'>,
    moderatorUserId: string,
    note?: string,
  ) {
    const review = await this.reviewsRepository.findByIdForModeration(reviewId);
    // 404, nao 403 — mesma regra de isolamento multi-tenant do resto do projeto (ver ADR-0005).
    if (!review || review.cruise.organizerId !== organizerId) {
      throw new NotFoundException('Avaliacao nao encontrada.');
    }
    ReviewModerationPolicy.assertValidTransition(review.status, status);

    const updated = await this.reviewsRepository.updateStatus(reviewId, status, moderatorUserId, note);
    this.eventEmitter.emit(DomainEvent.REVIEW_MODERATED, {
      reviewId: updated.id,
      bookingId: updated.bookingId,
      status,
    });
    return this.toView(updated);
  }

  private toView(review: { id: string; rating: number; comment: string | null; status: ReviewStatus; createdAt: Date; moderationNote: string | null }): ReviewView {
    return {
      id: review.id,
      rating: review.rating,
      comment: review.comment,
      status: review.status,
      createdAt: review.createdAt,
      moderationNote: review.moderationNote,
    };
  }
}
