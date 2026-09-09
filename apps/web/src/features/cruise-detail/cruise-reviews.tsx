import { Star } from 'lucide-react';
import { SectionHeading } from '@/components/ui/section-heading';
import { formatDate } from '@/lib/format';
import type { CruiseReviewsResult } from '@/services/reviews.service';

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${rating} de 5 estrelas`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`h-4 w-4 ${i < rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} aria-hidden="true" />
      ))}
    </div>
  );
}

/** So `APPROVED` chega aqui (ver ReviewsRepository.findApprovedByCruiseSlug) — moderacao pendente/rejeitada nunca aparece publicamente. */
export function CruiseReviews({ result }: { result: CruiseReviewsResult }) {
  if (result.data.length === 0) return null;

  const total = result.meta.total;

  return (
    <div>
      <SectionHeading
        eyebrow="Quem já viajou"
        title="Avaliações"
        icon={<Star className="h-6 w-6 text-amber-500" aria-hidden="true" />}
        description={
          result.averageRating
            ? `Nota média ${result.averageRating.toFixed(1)} de 5, com base em ${total} ${total > 1 ? 'avaliações' : 'avaliação'}.`
            : undefined
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {result.data.map((review) => (
          <div key={review.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <Stars rating={review.rating} />
              <span className="text-xs text-slate-400">{formatDate(review.createdAt)}</span>
            </div>
            <p className="mt-2 text-sm font-medium text-slate-900">{review.passengerName}</p>
            {review.comment && <p className="mt-1 text-sm text-slate-600">{review.comment}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
