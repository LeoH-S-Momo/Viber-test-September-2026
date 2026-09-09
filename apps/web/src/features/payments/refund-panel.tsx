'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { buttonVariants } from '@/components/ui/button-styles';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth-context';
import { formatDateTime, formatPrice } from '@/lib/format';
import { issueRefund, listRefundsForPayment, type RefundView } from '@/services/payments.service';

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

const inputClassName =
  'rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500';

/**
 * Historico + emissao de reembolso de um pagamento — usado no detalhe do pagamento tanto no
 * painel admin (`canIssue`, sem restricao) quanto no do organizador (`canIssue`, so pagamentos
 * do proprio negocio, ja filtrado pelo backend). `paidAmount` e o total cobrado (Payment.amount,
 * ja com juros de parcelamento se houver — ver InstallmentPricing), nao o preco da viagem.
 */
export function RefundPanel({
  paymentId,
  paidAmount,
  canIssue,
}: {
  paymentId: string;
  paidAmount: string;
  canIssue: boolean;
}) {
  const { accessToken } = useAuth();
  const [refunds, setRefunds] = useState<RefundView[] | 'loading' | 'error'>('loading');
  const [formOpen, setFormOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    listRefundsForPayment(accessToken, paymentId).then((result) => setRefunds(result.ok ? result.data : 'error'));
  }, [accessToken, paymentId]);

  const refundedTotal = Array.isArray(refunds)
    ? refunds.filter((r) => r.status === 'COMPLETED').reduce((sum, r) => sum + Number(r.amount), 0)
    : 0;
  const remaining = Number(paidAmount) - refundedTotal;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!accessToken) return;
    setSubmitting(true);
    setError(null);
    const result = await issueRefund(accessToken, paymentId, { amount: Number(amount), reason });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setFormOpen(false);
    setAmount('');
    setReason('');
    setRefunds((prev) => (Array.isArray(prev) ? [result.data, ...prev] : [result.data]));
  }

  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 pt-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reembolsos</p>
        {canIssue && refunds !== 'loading' && remaining > 0 && !formOpen && (
          <button type="button" onClick={() => setFormOpen(true)} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            Reembolsar
          </button>
        )}
      </div>

      {formOpen && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="refund-amount" className="text-xs font-medium text-slate-700">
              Valor (máx. {formatPrice(remaining)})
            </label>
            <input
              id="refund-amount"
              type="number"
              step="0.01"
              min="0.01"
              max={remaining}
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={inputClassName}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="refund-reason" className="text-xs font-medium text-slate-700">
              Motivo
            </label>
            <textarea
              id="refund-reason"
              required
              minLength={3}
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={inputClassName}
            />
          </div>
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={submitting} className={buttonVariants({ variant: 'primary', size: 'sm' })}>
              {submitting ? 'Processando…' : 'Confirmar reembolso'}
            </button>
            <button type="button" onClick={() => setFormOpen(false)} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {refunds === 'loading' && <p className="text-xs text-slate-400">Carregando…</p>}
      {refunds === 'error' && <p className="text-xs text-red-600">Não foi possível carregar os reembolsos.</p>}
      {Array.isArray(refunds) && refunds.length === 0 && <p className="text-xs text-slate-400">Nenhum reembolso ainda.</p>}
      {Array.isArray(refunds) && refunds.length > 0 && (
        <ul className="flex flex-col gap-2">
          {refunds.map((refund) => (
            <li key={refund.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
              <div>
                <p className="font-medium text-slate-900">{formatPrice(refund.amount)}</p>
                <p className="text-slate-500">{refund.reason}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge tone={STATUS_TONE[refund.status]}>{STATUS_LABEL[refund.status]}</Badge>
                <span className="text-slate-400">{formatDateTime(refund.createdAt)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
