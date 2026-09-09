'use client';

import { Star } from 'lucide-react';
import { SectionHeading } from '@/components/ui/section-heading';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { RequireRole } from '@/components/require-role';
import { AdminActionButton } from '@/features/admin/admin-action-button';
import { AdminPagination } from '@/features/admin/admin-pagination';
import { filterInputClassName } from '@/features/admin/admin-ui';
import { useAdminList } from '@/features/admin/use-admin-list';
import { formatDate } from '@/lib/format';
import { moderateReview, listReviewsForModeration, type ReviewStatus } from '@/services/reviews.service';

const STATUS_LABEL: Record<ReviewStatus, string> = {
  PENDING: 'Pendente',
  APPROVED: 'Aprovada',
  REJECTED: 'Rejeitada',
  HIDDEN: 'Oculta',
};

const STATUS_TONE: Record<ReviewStatus, 'success' | 'neutral' | 'accent'> = {
  PENDING: 'accent',
  APPROVED: 'success',
  REJECTED: 'neutral',
  HIDDEN: 'neutral',
};

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${rating} de 5 estrelas`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`h-4 w-4 ${i < rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} aria-hidden="true" />
      ))}
    </div>
  );
}

function ReviewsContent() {
  const { state, page, setPage, filters, updateFilter, reload } = useAdminList(listReviewsForModeration, {
    status: 'PENDING' as ReviewStatus | undefined,
  });

  return (
    <>
      <SectionHeading
        eyebrow="Reputação"
        title="Avaliações"
        icon={<Star className="h-6 w-6 text-amber-500" aria-hidden="true" />}
        description="Avaliações enviadas por passageiros após o desembarque — aprove, rejeite ou oculte."
      />

      <div className="mb-6 flex flex-wrap gap-3">
        <select
          value={filters.status ?? ''}
          onChange={(e) => updateFilter({ status: (e.target.value || undefined) as ReviewStatus | undefined })}
          className={filterInputClassName}
        >
          <option value="">Todos os status</option>
          {(Object.keys(STATUS_LABEL) as ReviewStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      {state.status === 'loading' && <Skeleton className="h-64 w-full rounded-2xl" />}
      {state.status === 'ready' && !state.result.ok && <ErrorState message={state.result.message} />}
      {state.status === 'ready' && state.result.ok && (
        <>
          {state.result.data.data.length === 0 ? (
            <EmptyState icon={<Star className="h-6 w-6" aria-hidden="true" />} title="Nenhuma avaliação encontrada" />
          ) : (
            <ul className="flex flex-col gap-3">
              {state.result.data.data.map((review) => (
                <li key={review.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Stars rating={review.rating} />
                      <p className="mt-1 font-medium text-slate-900">{review.passengerName}</p>
                      <p className="text-xs text-slate-500">
                        {review.cruiseTitle} · {formatDate(review.createdAt)}
                      </p>
                      {review.comment && <p className="mt-2 text-sm text-slate-600">{review.comment}</p>}
                    </div>
                    <Badge tone={STATUS_TONE[review.status]}>{STATUS_LABEL[review.status]}</Badge>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {review.status === 'PENDING' && (
                      <>
                        <AdminActionButton
                          label="Aprovar"
                          confirmMessage="Aprovar esta avaliação e publicá-la na página do cruzeiro?"
                          action={(accessToken) => moderateReview(accessToken, review.id, { status: 'APPROVED' })}
                          onDone={reload}
                        />
                        <AdminActionButton
                          label="Rejeitar"
                          promptMessage="Motivo da rejeição (opcional):"
                          action={(accessToken, reason) => moderateReview(accessToken, review.id, { status: 'REJECTED', note: reason })}
                          onDone={reload}
                          danger
                        />
                      </>
                    )}
                    {(review.status === 'APPROVED' || review.status === 'REJECTED') && (
                      <AdminActionButton
                        label="Ocultar"
                        promptMessage="Motivo da ocultação (opcional):"
                        action={(accessToken, reason) => moderateReview(accessToken, review.id, { status: 'HIDDEN', note: reason })}
                        onDone={reload}
                        danger
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <AdminPagination meta={state.result.data.meta} page={page} setPage={setPage} />
        </>
      )}
    </>
  );
}

export default function OrganizerReviewsPage() {
  return (
    <RequireRole roles={['ORGANIZER_ADMIN']}>
      <ReviewsContent />
    </RequireRole>
  );
}
