'use client';

import { useState } from 'react';
import { Wallet } from 'lucide-react';
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
import { formatDateTime, formatPrice } from '@/lib/format';
import { getPayment, listPayments } from '@/services/admin.service';
import type { AdminPaymentListItem, AdminPaymentStatus } from '@/types/admin';

const STATUS_TONE: Record<AdminPaymentStatus, 'success' | 'neutral' | 'accent'> = {
  APPROVED: 'success',
  PENDING: 'accent',
  DECLINED: 'neutral',
  REFUNDED: 'neutral',
};

const STATUS_LABEL: Record<AdminPaymentStatus, string> = {
  APPROVED: 'Aprovado',
  PENDING: 'Pendente',
  DECLINED: 'Recusado',
  REFUNDED: 'Reembolsado',
};

function PaymentDetailModal({ paymentId, onClose }: { paymentId: string; onClose: () => void }) {
  const detail = useAdminDetail(getPayment, paymentId);

  return (
    <Modal title="Detalhes do pagamento" onClose={onClose}>
      {detail === 'loading' && <Skeleton className="h-40 w-full rounded-xl" />}
      {detail === 'error' && <ErrorState message="Não foi possível carregar este pagamento." />}
      {detail !== 'loading' && detail !== 'error' && (
        <div className="flex flex-col gap-4 text-sm">
          <div>
            <p className="font-medium text-slate-900">{detail.booking.user.fullName}</p>
            <p className="text-slate-500">
              {detail.booking.user.email} · {detail.booking.cruise.title}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[detail.status]}>{STATUS_LABEL[detail.status]}</Badge>
            <Badge tone="brand">{detail.method}</Badge>
          </div>
          <p className="font-medium text-slate-900">{formatPrice(detail.amount)}</p>
          <p className="text-slate-600">Reserva total: {formatPrice(detail.booking.totalAmount)}</p>
          <p className="text-xs text-slate-500">Criado em {formatDateTime(detail.createdAt)}</p>
          {detail.paidAt && <p className="text-xs text-slate-500">Pago em {formatDateTime(detail.paidAt)}</p>}
          {detail.failureReason && <p className="rounded-lg bg-slate-50 px-3 py-2 text-slate-600">Motivo da recusa: {detail.failureReason}</p>}
          <p className="text-xs text-slate-400">ID da transação simulada: {detail.simulatedTransactionId}</p>
        </div>
      )}
    </Modal>
  );
}

export default function AdminPaymentsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { state, page, setPage, filters, updateFilter } = useAdminList(listPayments, {} as { status?: string; method?: string });

  return (
    <>
      <SectionHeading
        eyebrow="Painel Admin"
        title="Pagamentos"
        icon={<Wallet className="h-6 w-6 text-accent-600" aria-hidden="true" />}
        description="Todos os pagamentos processados na plataforma."
      />

      <div className="mb-6 flex flex-wrap gap-3">
        <select
          value={filters.status ?? ''}
          onChange={(e) => updateFilter({ status: e.target.value || undefined })}
          className={filterInputClassName}
        >
          <option value="">Todos os status</option>
          {(Object.keys(STATUS_LABEL) as AdminPaymentStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select
          value={filters.method ?? ''}
          onChange={(e) => updateFilter({ method: e.target.value || undefined })}
          className={filterInputClassName}
        >
          <option value="">Todos os métodos</option>
          <option value="CREDIT_CARD">Cartão de crédito</option>
          <option value="PIX">PIX</option>
          <option value="BOLETO">Boleto</option>
        </select>
      </div>

      {state.status === 'loading' && <Skeleton className="h-64 w-full rounded-2xl" />}
      {state.status === 'ready' && !state.result.ok && <ErrorState message={state.result.message} />}
      {state.status === 'ready' && state.result.ok && (
        <>
          {state.result.data.data.length === 0 ? (
            <EmptyState icon={<Wallet className="h-6 w-6" aria-hidden="true" />} title="Nenhum pagamento encontrado" />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Titular</th>
                    <th className="px-4 py-3">Cruzeiro</th>
                    <th className="px-4 py-3">Método</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Valor</th>
                    <th className="px-4 py-3">Criado em</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {state.result.data.data.map((payment: AdminPaymentListItem) => (
                    <tr key={payment.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{payment.booking.user.fullName}</p>
                        <p className="text-xs text-slate-500">{payment.booking.user.email}</p>
                      </td>
                      <td className="px-4 py-3">{payment.booking.cruise.title}</td>
                      <td className="px-4 py-3">{payment.method}</td>
                      <td className="px-4 py-3">
                        <Badge tone={STATUS_TONE[payment.status]}>{STATUS_LABEL[payment.status]}</Badge>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">{formatPrice(payment.amount)}</td>
                      <td className="px-4 py-3 text-slate-500">{formatDateTime(payment.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedId(payment.id)}
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

      {selectedId && <PaymentDetailModal paymentId={selectedId} onClose={() => setSelectedId(null)} />}
    </>
  );
}
