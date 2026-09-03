import { PaymentMethod, Prisma } from '@prisma/client';

/**
 * Porta (interface) do gateway de pagamento — ver
 * docs/architecture/decisions/0012-checkout-payment-gateway.md. Nenhum
 * modulo de dominio (bookings, pricing) importa `FakePaymentGateway`
 * diretamente: todos dependem so deste contrato, injetado pelo token
 * `PAYMENT_GATEWAY`. Trocar por Stripe/Mercado Pago no futuro significa
 * escrever uma nova classe que implementa esta interface e trocar o
 * provider em `payments.module.ts` — nada em `bookings` muda (ver o ADR
 * para o racional completo e um esboco de `StripePaymentGateway`).
 */
export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

/** Desfecho de uma cobranca — nunca inclui "TIMEOUT": um timeout e a AUSENCIA de resposta, nao uma resposta (ver PaymentGatewayTimeoutError). */
export type GatewayOutcome = 'APPROVED' | 'DECLINED' | 'PENDING';

export interface ChargeRequest {
  /** Sempre um valor calculado pelo backend (PricingEngine) — o gateway nunca recebe/confia em preco vindo do cliente. */
  amount: Prisma.Decimal;
  currency: string;
  method: PaymentMethod;
  /**
   * Chave de idempotencia da cobranca — repetir a MESMA chave nunca gera uma
   * segunda cobranca real, sempre devolve o resultado da primeira tentativa
   * (mesmo padrao do header `Idempotency-Key` do Stripe, ja usado neste
   * projeto para a criacao de hold — ver ADR-0010). Escopada por tentativa
   * de pagamento (normalmente `payment.id`), nao por reserva — cada retry
   * apos uma recusa cria uma nova tentativa com uma nova chave.
   */
  idempotencyKey: string;
  description?: string;
}

export interface ChargeResult {
  outcome: GatewayOutcome;
  /** Referencia da transacao no gateway (ex.: id do PaymentIntent no Stripe). */
  gatewayTransactionId: string;
  /** So preenchido quando outcome === 'DECLINED'. */
  declineReason?: string;
}

/**
 * Lançada quando a chamada ao gateway nao completa a tempo (rede, gateway
 * fora do ar) — DISTINTA de um desfecho `PENDING` de negocio (que e uma
 * resposta valida do gateway, ex.: boleto gerado). Um timeout significa
 * "nao sabemos o que aconteceu", nunca deve ser tratado como recusa nem
 * como aprovacao — ver BookingsService.checkout.
 */
export class PaymentGatewayTimeoutError extends Error {
  constructor(message = 'Tempo esgotado aguardando resposta do gateway de pagamento.') {
    super(message);
    this.name = 'PaymentGatewayTimeoutError';
  }
}

export interface PaymentGateway {
  /** Tenta cobrar. Pode lancar `PaymentGatewayTimeoutError` — nunca deve ser chamado de novo com uma chave diferente so por isso (ver ADR). */
  charge(request: ChargeRequest): Promise<ChargeResult>;

  /**
   * Consulta o estado ATUAL de uma cobranca no gateway, pelo id retornado
   * por `charge`. Usado para verificar um callback/webhook antes de
   * confiar nele (nunca aceitar "pagamento aprovado" so porque um request
   * HTTP disse isso — ver BookingsService.confirmPayment) e para resolver
   * um `PENDING` (boleto, ou uma cobranca que respondeu com timeout mas
   * pode ter completado do lado do gateway).
   */
  retrieve(gatewayTransactionId: string): Promise<ChargeResult>;
}
