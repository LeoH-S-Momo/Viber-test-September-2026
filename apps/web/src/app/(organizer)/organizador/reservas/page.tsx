'use client';

import { useCallback, useEffect, useState } from 'react';
import { Ticket } from 'lucide-react';
import { SectionHeading } from '@/components/ui/section-heading';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button-styles';
import { RequireRole } from '@/components/require-role';
import { useAuth } from '@/lib/auth-context';
import { formatDate, formatPrice } from '@/lib/format';
import { getBookings, getMyCruises } from '@/services/organizers.service';
import type { CruiseSummary } from '@/types/cruise';
import type { OrganizerBooking, OrganizerBookingStatus } from '@/types/organizer';

const inputClassName =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500';

const STATUS_TONE: Record<OrganizerBookingStatus, 'success' | 'neutral' | 'accent'> = {
  CONFIRMED: 'success',
  COMPLETED: 'success',
  HELD: 'accent',
  PAYMENT_PENDING: 'accent',
  CANCELLED: 'neutral',
  EXPIRED: 'neutral',
  REFUNDED: 'neutral',
};

const STATUS_LABEL: Record<OrganizerBookingStatus, string> = {
  CONFIRMED: 'Confirmada',
  COMPLETED: 'Concluída',
  HELD: 'Em espera',
  PAYMENT_PENDING: 'Pagamento pendente',
  CANCELLED: 'Cancelada',
  EXPIRED: 'Expirada',
  REFUNDED: 'Reembolsada',
};

const STATUS_OPTIONS: OrganizerBookingStatus[] = ['HELD', 'PAYMENT_PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'COMPLETED', 'REFUNDED'];

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; result: Awaited<ReturnType<typeof getBookings>> };

function BookingsContent() {
  const { accessToken } = useAuth();
  const [cruises, setCruises] = useState<CruiseSummary[]>([]);
  const [cruiseId, setCruiseId] = useState('');
  const [bookingStatus, setBookingStatus] = useState('');
  const [page, setPage] = useState(1);
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    if (!accessToken) return;
    getMyCruises(accessToken).then((result) => {
      if (result.ok) setCruises(result.data.data);
    });
  }, [accessToken]);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setState({ status: 'loading' });
    const result = await getBookings(accessToken, { cruiseId: cruiseId || undefined, status: bookingStatus || undefined, page: String(page) });
    setState({ status: 'ready', result });
  }, [accessToken, cruiseId, bookingStatus, page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <SectionHeading
        eyebrow="Vendas"
        title="Reservas"
        icon={<Ticket className="h-6 w-6 text-accent-600" aria-hidden="true" />}
        description="Todas as reservas dos seus cruzeiros, com o titular e os hóspedes de cada uma."
      />

      <div className="mb-6 flex flex-wrap gap-3">
        <select
          value={cruiseId}
          onChange={(e) => {
            setPage(1);
            setCruiseId(e.target.value);
          }}
          className={inputClassName}
        >
          <option value="">Todos os cruzeiros</option>
          {cruises.map((cruise) => (
            <option key={cruise.id} value={cruise.id}>
              {cruise.title}
            </option>
          ))}
        </select>
        <select
          value={bookingStatus}
          onChange={(e) => {
            setPage(1);
            setBookingStatus(e.target.value);
          }}
          className={inputClassName}
        >
          <option value="">Todos os status</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABEL[status]}
            </option>
          ))}
        </select>
      </div>

      {state.status === 'loading' && <Skeleton className="h-64 w-full rounded-2xl" />}

      {state.status === 'ready' && !state.result.ok && <ErrorState message={state.result.message} />}

      {state.status === 'ready' && state.result.ok && (
        <>
          {state.result.data.data.length === 0 ? (
            <EmptyState icon={<Ticket className="h-6 w-6" aria-hidden="true" />} title="Nenhuma reserva encontrada" />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Titular</th>
                    <th className="px-4 py-3">Cruzeiro</th>
                    <th className="px-4 py-3">Cabine</th>
                    <th className="px-4 py-3">Hóspedes</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Total</th>
                    <th className="px-4 py-3">Criada em</th>
                  </tr>
                </thead>
                <tbody>
                  {state.result.data.data.map((booking: OrganizerBooking) => (
                    <tr key={booking.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{booking.user.fullName}</p>
                        <p className="text-xs text-slate-500">{booking.user.email}</p>
                      </td>
                      <td className="px-4 py-3">{booking.cruise.title}</td>
                      <td className="px-4 py-3">
                        {booking.cabin.code} <span className="text-xs text-slate-500">({booking.cabin.cabinCategory.name})</span>
                      </td>
                      <td className="px-4 py-3">{booking.guests.length}</td>
                      <td className="px-4 py-3">
                        <Badge tone={STATUS_TONE[booking.status]}>{STATUS_LABEL[booking.status]}</Badge>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">{formatPrice(booking.totalAmount)}</td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(booking.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {state.result.data.meta.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                Anterior
              </button>
              <span>
                Página {state.result.data.meta.page} de {state.result.data.meta.totalPages}
              </span>
              <button
                type="button"
                disabled={page >= state.result.data.meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                Próxima
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}

export default function OrganizerBookingsPage() {
  return (
    <RequireRole roles={['ORGANIZER_ADMIN']}>
      <BookingsContent />
    </RequireRole>
  );
}
