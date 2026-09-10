import { authFetchJson, getApiBaseUrl, qs, safeFetchJson, type ServiceResult } from '@/lib/api-client';
import type { PaginatedResult } from '@/types/cruise';

export type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'HIDDEN';

export interface ReviewView {
  id: string;
  rating: number;
  comment: string | null;
  status: ReviewStatus;
  createdAt: string;
  moderationNote: string | null;
}

export interface PublicReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  passengerName: string;
}

export type CruiseReviewsResult = PaginatedResult<PublicReview> & { averageRating: number | null };

export interface ReviewHighlight {
  id: string;
  rating: number;
  comment: string | null;
  passengerName: string;
  cruiseTitle: string;
  cruiseSlug: string;
}

export interface ReviewHighlightsResult {
  items: ReviewHighlight[];
  total: number;
  averageRating: number | null;
}

export interface ModerationReview {
  id: string;
  rating: number;
  comment: string | null;
  status: ReviewStatus;
  createdAt: string;
  moderatedAt: string | null;
  moderationNote: string | null;
  passengerName: string;
  cruiseTitle: string;
}

export type ModerationReviewsResult = PaginatedResult<ModerationReview>;

export function getMyReview(accessToken: string, bookingId: string): Promise<ServiceResult<ReviewView | null>> {
  return authFetchJson<ReviewView | null>(`/bookings/${bookingId}/review`, accessToken);
}

export function submitReview(
  accessToken: string,
  bookingId: string,
  input: { rating: number; comment?: string },
): Promise<ServiceResult<ReviewView>> {
  return authFetchJson<ReviewView>(`/bookings/${bookingId}/review`, accessToken, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getCruiseReviews(slug: string, page = 1): Promise<ServiceResult<CruiseReviewsResult>> {
  return safeFetchJson<CruiseReviewsResult>(`${getApiBaseUrl()}/cruises/${slug}/reviews${qs({ page })}`);
}

/** Depoimentos + contador da home pública — ver features/home/*. */
export function getReviewHighlights(limit = 6): Promise<ServiceResult<ReviewHighlightsResult>> {
  return safeFetchJson<ReviewHighlightsResult>(`${getApiBaseUrl()}/reviews/highlights${qs({ limit })}`);
}

export function listReviewsForModeration(
  accessToken: string,
  filters: { status?: ReviewStatus },
  page: number,
): Promise<ServiceResult<ModerationReviewsResult>> {
  return authFetchJson<ModerationReviewsResult>(`/organizador/reviews${qs({ ...filters, page })}`, accessToken);
}

export function moderateReview(
  accessToken: string,
  reviewId: string,
  input: { status: 'APPROVED' | 'REJECTED' | 'HIDDEN'; note?: string },
): Promise<ServiceResult<ReviewView>> {
  return authFetchJson<ReviewView>(`/organizador/reviews/${reviewId}/moderate`, accessToken, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}
