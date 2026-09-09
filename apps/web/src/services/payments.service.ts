import { authFetchJson, getApiBaseUrl, safeFetchJson, qs, type ServiceResult } from '@/lib/api-client';
import type { InstallmentOptionView } from '@seapass/contracts';

export interface RefundView {
  id: string;
  amount: string;
  reason: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  createdAt: string;
  processedAt: string | null;
}

/** Publico — usado no passo de pagamento do checkout pra mostrar a tabela de juros antes de escolher as parcelas. */
export function getInstallmentOptions(amount: number): Promise<ServiceResult<InstallmentOptionView[]>> {
  return safeFetchJson<InstallmentOptionView[]>(`${getApiBaseUrl()}/payments/installment-options${qs({ amount })}`);
}

export function issueRefund(
  accessToken: string,
  paymentId: string,
  input: { amount: number; reason: string },
): Promise<ServiceResult<RefundView>> {
  return authFetchJson<RefundView>(`/payments/${paymentId}/refund`, accessToken, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listRefundsForPayment(accessToken: string, paymentId: string): Promise<ServiceResult<RefundView[]>> {
  return authFetchJson<RefundView[]>(`/payments/${paymentId}/refunds`, accessToken);
}

export function listRefundsForBooking(accessToken: string, bookingId: string): Promise<ServiceResult<RefundView[]>> {
  return authFetchJson<RefundView[]>(`/bookings/${bookingId}/refunds`, accessToken);
}
