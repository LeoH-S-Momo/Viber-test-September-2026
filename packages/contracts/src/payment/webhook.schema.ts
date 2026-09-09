import { z } from "zod";

/**
 * Corpo do webhook de confirmacao de pagamento (mockado) — `outcome` aqui e so um sinal de "algo
 * mudou", NUNCA aplicado diretamente: o backend sempre reconsulta o gateway antes de confirmar
 * (ver BookingsService.confirmPaymentByTransactionId).
 */
export const PaymentWebhookEventSchema = z.object({
  gatewayTransactionId: z.string().min(1),
  outcome: z.enum(["APPROVED", "DECLINED"]),
  occurredAt: z.string().optional(),
});
export type PaymentWebhookEventInput = z.infer<typeof PaymentWebhookEventSchema>;
