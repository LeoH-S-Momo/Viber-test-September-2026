'use client';

import { useState } from 'react';
import { Ticket } from 'lucide-react';
import { SectionHeading } from '@/components/ui/section-heading';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { buttonVariants } from '@/components/ui/button-styles';
import { AdminPagination } from '@/features/admin/admin-pagination';
import { AdminActionButton } from '@/features/admin/admin-action-button';
import { filterInputClassName } from '@/features/admin/admin-ui';
import { useAdminDetail } from '@/features/admin/use-admin-detail';
import { useAdminList } from '@/features/admin/use-admin-list';
import { formatDate, formatPrice } from '@/lib/format';
import { cancelBooking, getBooking, listBookings } from '@/services/admin.service';
import type { AdminBookingListItem, AdminBookingStatus } from '@/types/admin';

const STATUS_TONE: Record<AdminBookingStatus, 'success' | 'neutral' | 'accent'> = {
  CONFIRMED: 'success',
  COMPLETED: 'success',
  HELD: 'accent',
  PAYMENT_PENDING: 'accent',
  CANCELLED: 'neutral',
  EXPIRED: 'neutral',
  REFUNDED: 'neutral',
};

const STATUS_LABEL: Record<AdminBookingStatus, string> = {
  CONFIRMED: 'Confirmada',
  COMPLETED: 'Concluída',
  HELD: 'Em espera',
  PAYMENT_PENDING: 'Pagamento pendente',
  CANCELLED: 'Cancelada',
  EXPIRED: 'Expirada',
  REFUNDED: 'Reembolsada',
};

const CANCELLABLE: AdminBookingStatus[] = ['HELD', 'PAYMENT_PENDING', 'CONFIRMED'];

function BookingDetailModal({ bookingId, onClose, onChanged }: { bookingId: string; onClose: () => void; onChanged: () => void }) {
  const detail = useAdminDetail(getBooking, bookingId);

  return (
    <Modal title="Detalhes da reserva" onClose={onClose}>
      {detail === 'loading' && <Skeleton className="h-40 w-full rounded-xl" />}
      {detail === 'error' && <ErrorState message="Não foi possível carregar esta reserva." />}
      {detail !== 'loading' && detail !== 'error' && (
        <div className="flex flex-col gap-4 text-sm">
          <div>
            <p className="font-medium text-slate-900">{detail.cruise.title}</p>
            <p className="text-slate-500">
              {detail.cruise.organizer.name} · Cabine {detail.cabin.code} ({detail.cabin.cabinCategory.name})
            </p>
          </div>
          <Badge tone={STATUS_TONE[detail.status]}>{STATUS_LABEL[detail.status]}</Badge>
          <div>
            <p className="font-medium text-slate-900">{detail.user.fullName}</p>
            <p className="text-slate-500">{detail.user.email}</p>
          </div>
          <div className="flex flex-wrap gap-6 text-slate-600">
            <span>Subtotal: {formatPrice(detail.subtotalAmount)}</span>
            <span>Desconto: {formatPrice(detail.discountAmount)}</span>
            <span>Taxa: {formatPrice(detail.feeAmount)}</span>
            <span className="font-medium text-slate-900">Total: {formatPrice(detail.totalAmount)}</span>
          </div>
          {detail.coupon && <p className="text-slate-600">Cupom aplicado: {detail.coupon.code}</p>}
          {detail.cancellationReason && (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-slate-600">Motivo do cancelamento: {detail.cancellationReason}</p>
          )}

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Hóspedes</h4>
            <ul className="flex flex-col gap-1">
              {detail.guests.map((g) => (
                <li key={g.id} className="rounded-lg border border-slate-200 px-3 py-2">
                  {g.fullName} {g.isPrimary && <span className="text-xs text-slate-500">(titular)</span>}
                </li>
              ))}
            </ul>
          </div>

          {detail.payments.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Pagamentos</h4>
              <ul className="flex flex-col gap-1">
                {detail.payments.map((p) => (
                  <li key={p.id} className="flex justify-between rounded-lg border border-slate-200 px-3 py-2">
                    <span>
                      {p.method} · {p.status}
                    </span>
                    <span className="font-medium text-slate-900">{formatPrice(p.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {CANCELLABLE.includes(detail.status) && (
            <div className="flex justify-end border-t border-slate-200 pt-4">
              <AdminActionButton
                label="Cancelar reserva"
                danger
                promptMessage="Motivo do cancelamento (opcional):"
                action={(token, reason) => cancelBooking(token, bookingId, reason)}
                onDone={() => {
                  onChanged();
                  onClose();
                }}
              />
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function AdminBookingsPage() {
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { state, page, setPage, filters, updateFilter, reload } = useAdminList(listBookings, {} as { q?: string; status?: string; cruiseId?: string });

  return (
    <>
      <SectionHeading
        eyebrow="Painel Admin"
        title="Reservas"
        icon={<Ticket className="h-6 w-6 text-accent-600" aria-hidden="true" />}
        description="Todas as reservas da plataforma, de qualquer organizador."
      />

      <form
        className="mb-6 flex flex-wrap gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          updateFilter({ q: q || undefined });
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por titular ou hóspede…"
          className={`${filterInputClassName} w-64`}
        />
        <button type="submit" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Buscar
        </button>
        <select
          value={filters.status ?? ''}
          onChange={(e) => updateFilter({ status: e.target.value || undefined })}
          className={filterInputClassName}
        >
          <option value="">Todos os status</option>
          {(Object.keys(STATUS_LABEL) as AdminBookingStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </form>

      {state.status === 'loading' && <Skeleton className="h-64 w-full rounded-2xl" />}
      {state.status === 'ready' && !state.result.ok && <ErrorState message={state.result.message} onRetry={reload} />}
      {state.status === 'ready' && state.result.ok && (
        <>
          {state.result.data.data.length === 0 ? (
            <EmptyState icon={<Ticket className="h-6 w-6" aria-hidden="true" />} title="Nenhuma reserva encontrada" />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Titular</th>
                    <th className="px-4 py-3">Cruzeiro</th>
                    <th className="px-4 py-3">Cabine</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Total</th>
                    <th className="px-4 py-3">Criada em</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {state.result.data.data.map((booking: AdminBookingListItem) => (
                    <tr key={booking.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{booking.user.fullName}</p>
                        <p className="text-xs text-slate-500">{booking.user.email}</p>
                      </td>
                      <td className="px-4 py-3">{booking.cruise.title}</td>
                      <td className="px-4 py-3">{booking.cabin.code}</td>
                      <td className="px-4 py-3">
                        <Badge tone={STATUS_TONE[booking.status]}>{STATUS_LABEL[booking.status]}</Badge>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">{formatPrice(booking.totalAmount)}</td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(booking.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedId(booking.id)}
                          className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                        >
                          Detalhes
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <AdminPagination meta={state.result.data.meta} page={page} setPage={setPage} />
        </>
      )}

      {selectedId && <BookingDetailModal bookingId={selectedId} onClose={() => setSelectedId(null)} onChanged={reload} />}
    </>
  );
}
