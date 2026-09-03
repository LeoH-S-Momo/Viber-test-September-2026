import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';
import {
  PaymentGatewayTimeoutError,
  type ChargeRequest,
  type ChargeResult,
  type GatewayOutcome,
  type PaymentGateway,
} from '../domain/payment-gateway';

/**
 * Implementacao "fake" de `PaymentGateway` — simula um gateway de verdade
 * (Stripe/Mercado Pago) sem chamar rede nenhuma, pra permitir testar e
 * demonstrar o fluxo completo de checkout sem depender de credenciais ou
 * infraestrutura externa (ver docs/architecture/decisions/0012-checkout-payment-gateway.md).
 *
 * Regra de decisao, DETERMINISTICA (nunca aleatoria de verdade — testes
 * precisam de resultado reprodutivel), lida do sufixo de `idempotencyKey`:
 *   - termina em `::decline` -> DECLINED
 *   - termina em `::timeout` -> lanca PaymentGatewayTimeoutError na PRIMEIRA
 *     chamada (a cobranca e decidida — APPROVED — do lado do gateway, so a
 *     RESPOSTA nunca chega); uma segunda chamada com a MESMA chave, ou uma
 *     chamada a `retrieve`, revela o resultado real — e o ponto de existir
 *     idempotencia (ver ADR-0012)
 *   - termina em `::pending` -> PENDING, e fica PENDING para sempre mesmo
 *     em `retrieve` (para testar o caso que nunca se resolve)
 *   - nenhum sufixo reconhecido: `PaymentMethod.BOLETO` -> PENDING (como na
 *     vida real, boleto so compensa depois); qualquer outro metodo -> APPROVED
 *
 * Estes sufixos sao um detalhe de teste DESTA implementacao — nao fazem
 * parte da interface `PaymentGateway`. Um gateway real (Stripe) tem seu
 * proprio mecanismo de sandbox (numeros de cartao de teste) para o mesmo
 * proposito; nenhum codigo de `bookings` precisa saber que esses sufixos
 * existem, nem precisaria mudar se eles deixassem de existir.
 */
@Injectable()
export class FakePaymentGateway implements PaymentGateway {
  private readonly logger = new Logger(FakePaymentGateway.name);

  /** Idempotencia real: a MESMA chave nunca gera uma segunda decisao — sempre devolve o resultado ja tomado. */
  private readonly resultsByIdempotencyKey = new Map<string, ChargeResult>();
  private readonly resultsByTransactionId = new Map<string, ChargeResult>();
  private readonly idempotencyKeyByTransactionId = new Map<string, string>();
  /** ids de transacao que devem permanecer PENDING para sempre em `retrieve` (sufixo `::pending`). */
  private readonly stuckPendingTransactionIds = new Set<string>();

  async charge(request: ChargeRequest): Promise<ChargeResult> {
    const cached = this.resultsByIdempotencyKey.get(request.idempotencyKey);
    if (cached) {
      this.logger.debug(
        `Chave de idempotencia reutilizada (${request.idempotencyKey}) — devolvendo resultado ja decidido, sem cobrar de novo.`,
      );
      return cached;
    }

    if (request.idempotencyKey.endsWith('::timeout')) {
      // A cobranca E decidida (aprovada) do lado do gateway — so esta resposta nunca chega.
      this.finalize(request, 'APPROVED');
      throw new PaymentGatewayTimeoutError();
    }

    if (request.idempotencyKey.endsWith('::pending')) {
      const result = this.finalize(request, 'PENDING');
      this.stuckPendingTransactionIds.add(result.gatewayTransactionId);
      return result;
    }

    if (request.idempotencyKey.endsWith('::decline')) {
      return this.finalize(request, 'DECLINED');
    }

    const outcome: GatewayOutcome = request.method === PaymentMethod.BOLETO ? 'PENDING' : 'APPROVED';
    return this.finalize(request, outcome);
  }

  async retrieve(gatewayTransactionId: string): Promise<ChargeResult> {
    const result = this.resultsByTransactionId.get(gatewayTransactionId);
    if (!result) {
      throw new Error(`FakePaymentGateway: nenhuma cobranca encontrada para ${gatewayTransactionId}.`);
    }
    if (result.outcome !== 'PENDING' || this.stuckPendingTransactionIds.has(gatewayTransactionId)) {
      return result;
    }
    // PENDING "de verdade" (boleto ainda nao compensado, ou um timeout que na real aprovou) resolve
    // pra APPROVED ao ser consultado — o `confirmPayment` do dominio de Booking simula o webhook
    // que so dispara quando isso acontece.
    const resolved: ChargeResult = { ...result, outcome: 'APPROVED' };
    this.resultsByTransactionId.set(gatewayTransactionId, resolved);
    this.resultsByIdempotencyKey.set(this.findIdempotencyKeyFor(gatewayTransactionId), resolved);
    return resolved;
  }

  private findIdempotencyKeyFor(gatewayTransactionId: string): string {
    return this.idempotencyKeyByTransactionId.get(gatewayTransactionId) ?? gatewayTransactionId;
  }

  private finalize(request: ChargeRequest, outcome: GatewayOutcome): ChargeResult {
    const result: ChargeResult = {
      outcome,
      gatewayTransactionId: `FAKE-${randomUUID()}`,
      declineReason: outcome === 'DECLINED' ? 'Simulacao: pagamento recusado pelo FakePaymentGateway.' : undefined,
    };
    this.resultsByIdempotencyKey.set(request.idempotencyKey, result);
    this.resultsByTransactionId.set(result.gatewayTransactionId, result);
    this.idempotencyKeyByTransactionId.set(result.gatewayTransactionId, request.idempotencyKey);
    return result;
  }
}
