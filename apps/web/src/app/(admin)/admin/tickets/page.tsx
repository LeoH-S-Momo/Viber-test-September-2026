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
import { filterInputClassName } from '@/features/admin/admin-ui';
import { useAdminDetail } from '@/features/admin/use-admin-detail';
import { useAdminList } from '@/features/admin/use-admin-list';
import { formatDateTime } from '@/lib/format';
import { getTicket, listTickets } from '@/services/admin.service';
import type { AdminTicketListItem, AdminTicketStatus } from '@/types/admin';

const STATUS_TONE: Record<AdminTicketStatus, 'success' | 'neutral' | 'accent'> = {
  ISSUED: 'accent',
  CHECKED_IN: 'success',
  CANCELLED: 'neutral',
};

const STATUS_LABEL: Record<AdminTicketStatus, string> = {
  ISSUED: 'Emitido',
  CHECKED_IN: 'Check-in feito',
  CANCELLED: 'Cancelado',
};

function TicketDetailModal({ ticketId, onClose }: { ticketId: string; onClose: () => void }) {
  const detail = useAdminDetail(getTicket, ticketId);

  return (
    <Modal title="Detalhes do ticket" onClose={onClose}>
      {detail === 'loading' && <Skeleton className="h-40 w-full rounded-xl" />}
      {detail === 'error' && <ErrorState message="Não foi possível carregar este ticket." />}
      {detail !== 'loading' && detail !== 'error' && (
        <div className="flex flex-col gap-4 text-sm">
          <div>
            <p className="font-medium text-slate-900">{detail.bookingGuest.fullName}</p>
            <p className="text-slate-500">
              {detail.bookingGuest.booking.cruise.title} · Cabine {detail.bookingGuest.booking.cabin.code}
            </p>
          </div>
          <Badge tone={STATUS_TONE[detail.status]}>{STATUS_LABEL[detail.status]}</Badge>
          <p className="font-mono text-xs text-slate-500">{detail.qrCode}</p>
          <p className="text-xs text-slate-500">Emitido em {formatDateTime(detail.issuedAt)}</p>

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Histórico de check-in</h4>
            {detail.checkIns.length === 0 ? (
              <p className="text-slate-500">Nenhum check-in registrado.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {detail.checkIns.map((c) => (
                  <li key={c.id} className="rounded-lg border border-slate-200 px-3 py-2">
                    <p className="font-medium text-slate-900">{formatDateTime(c.checkedInAt)}</p>
                    <p className="text-xs text-slate-500">
                      {c.staffUser.fullName} ({c.staffUser.email}) {c.location && `· ${c.location}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function AdminTicketsPage() {
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { state, page, setPage, filters, updateFilter } = useAdminList(listTickets, {} as { q?: string; status?: string });

  return (
    <>
      <SectionHeading
        eyebrow="Painel Admin"
        title="Tickets"
        icon={<Ticket className="h-6 w-6 text-accent-600" aria-hidden="true" />}
        description="Todos os ingressos digitais emitidos na plataforma."
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
          placeholder="Buscar por código ou hóspede…"
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
          {(Object.keys(STATUS_LABEL) as AdminTicketStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </form>

      {state.status === 'loading' && <Skeleton className="h-64 w-full rounded-2xl" />}
      {state.status === 'ready' && !state.result.ok && <ErrorState message={state.result.message} />}
      {state.status === 'ready' && state.result.ok && (
        <>
          {state.result.data.data.length === 0 ? (
            <EmptyState icon={<Ticket className="h-6 w-6" aria-hidden="true" />} title="Nenhum ticket encontrado" />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Hóspede</th>
                    <th className="px-4 py-3">Cruzeiro</th>
                    <th className="px-4 py-3">Código</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Emitido em</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {state.result.data.data.map((ticket: AdminTicketListItem) => (
                    <tr key={ticket.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3 font-medium text-slate-900">{ticket.bookingGuest.fullName}</td>
                      <td className="px-4 py-3">{ticket.bookingGuest.booking.cruise.title}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{ticket.qrCode}</td>
                      <td className="px-4 py-3">
                        <Badge tone={STATUS_TONE[ticket.status]}>{STATUS_LABEL[ticket.status]}</Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{formatDateTime(ticket.issuedAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedId(ticket.id)}
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

      {selectedId && <TicketDetailModal ticketId={selectedId} onClose={() => setSelectedId(null)} />}
    </>
  );
}
