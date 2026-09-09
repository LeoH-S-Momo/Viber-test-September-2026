'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { SectionHeading } from '@/components/ui/section-heading';
import { Skeleton } from '@/components/ui/skeleton';
import { buttonVariants } from '@/components/ui/button-styles';
import { getMyReview, submitReview, type ReviewView } from '@/services/reviews.service';

const STATUS_LABEL: Record<ReviewView['status'], string> = {
  PENDING: 'Aguardando moderação',
  APPROVED: 'Publicada',
  REJECTED: 'Não aprovada para publicação',
  HIDDEN: 'Removida da página do cruzeiro',
};

const STATUS_TONE: Record<ReviewView['status'], 'success' | 'neutral' | 'accent'> = {
  PENDING: 'accent',
  APPROVED: 'success',
  REJECTED: 'neutral',
  HIDDEN: 'neutral',
};

function StarPicker({ value, onChange }: { value: number; onChange: (rating: number) => void }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Nota">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} de 5 estrelas`}
          onClick={() => onChange(star)}
          className="p-0.5"
        >
          <Star className={`h-6 w-6 ${star <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

/**
 * So aparece depois do desembarque (ver ReviewEligibilityPolicy no backend — checado de novo lá,
 * isto aqui so evita mostrar um formulário que o backend recusaria).
 */
export function TripReview({
  bookingId,
  accessToken,
  disembarkationDate,
}: {
  bookingId: string;
  accessToken: string;
  disembarkationDate: string;
}) {
  const [review, setReview] = useState<ReviewView | null | 'loading' | 'error'>('loading');
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eligible = new Date(disembarkationDate) < new Date();

  useEffect(() => {
    if (!eligible) return;
    getMyReview(accessToken, bookingId).then((result) => setReview(result.ok ? result.data : 'error'));
  }, [accessToken, bookingId, eligible]);

  if (!eligible) return null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (rating === 0) return;
    setSubmitting(true);
    setError(null);
    const result = await submitReview(accessToken, bookingId, { rating, comment: comment.trim() || undefined });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setReview(result.data);
  }

  return (
    <div>
      <SectionHeading
        eyebrow="Sua opinião"
        title="Avalie esta viagem"
        icon={<Star className="h-6 w-6 text-amber-500" aria-hidden="true" />}
        description="Sua avaliação passa por moderação do organizador antes de aparecer na página pública do cruzeiro."
      />

      {review === 'loading' && <Skeleton className="h-32 w-full rounded-2xl" />}
      {review === 'error' && <p className="text-sm text-red-600">Não foi possível carregar sua avaliação.</p>}

      {review && review !== 'loading' && review !== 'error' && (
        <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={`h-5 w-5 ${i < review.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`}
                aria-hidden="true"
              />
            ))}
            <Badge tone={STATUS_TONE[review.status]}>{STATUS_LABEL[review.status]}</Badge>
          </div>
          {review.comment && <p className="text-sm text-slate-600">{review.comment}</p>}
          {review.moderationNote && <p className="text-xs text-slate-400">Nota do organizador: {review.moderationNote}</p>}
        </div>
      )}

      {review === null && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <StarPicker value={rating} onChange={setRating} />
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={1000}
            placeholder="Conte como foi sua viagem (opcional)"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            rows={3}
          />
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting || rating === 0}
            className={buttonVariants({ variant: 'primary', className: 'self-start' })}
          >
            {submitting ? 'Enviando…' : 'Enviar avaliação'}
          </button>
        </form>
      )}
    </div>
  );
}
