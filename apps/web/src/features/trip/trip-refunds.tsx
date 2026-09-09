'use client';

import { useEffect, useState } from 'react';
import { Receipt } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { SectionHeading } from '@/components/ui/section-heading';
import { formatDate, formatPrice } from '@/lib/format';
import { listRefundsForBooking, type RefundView } from '@/services/payments.service';

const STATUS_TONE: Record<RefundView['status'], 'success' | 'neutral' | 'accent'> = {
  COMPLETED: 'success',
  PENDING: 'accent',
  FAILED: 'neutral',
};
const STATUS_LABEL: Record<RefundView['status'], string> = {
  COMPLETED: 'Concluído',
  PENDING: 'Pendente',
  FAILED: 'Falhou',
};

/** Somente leitura — reembolsos so podem ser emitidos pelo organizador/admin (ver RefundPanel). */
export function TripRefunds({ bookingId, accessToken }: { bookingId: string; accessToken: string }) {
  const [refunds, setRefunds] = useState<RefundView[]>([]);

  useEffect(() => {
    listRefundsForBooking(accessToken, bookingId).then((result) => {
      if (result.ok) setRefunds(result.data);
    });
  }, [accessToken, bookingId]);

  if (refunds.length === 0) return null;

  return (
    <div>
      <SectionHeading
        eyebrow="Pagamento"
        title="Reembolsos"
        icon={<Receipt className="h-6 w-6 text-brand-600" aria-hidden="true" />}
        description="Histórico de reembolsos desta reserva."
      />
      <ul className="flex flex-col gap-2">
        {refunds.map((refund) => (
          <li
            key={refund.id}
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"
          >
            <div>
              <p className="font-medium text-slate-900">{formatPrice(refund.amount)}</p>
              <p className="text-xs text-slate-500">{refund.reason}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge tone={STATUS_TONE[refund.status]}>{STATUS_LABEL[refund.status]}</Badge>
              <span className="text-xs text-slate-400">{formatDate(refund.createdAt)}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
