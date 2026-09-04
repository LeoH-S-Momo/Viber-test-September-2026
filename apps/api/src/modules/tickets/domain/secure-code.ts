import { randomUUID } from 'node:crypto';

/**
 * Codigo seguro de um ticket (o valor codificado no QR Code — ver
 * docs/architecture/decisions/0013-digital-ticket-checkin.md). `randomUUID`
 * usa um gerador criptograficamente seguro (RFC 4122 v4, ~122 bits de
 * entropia aleatoria) — imprevisivel e impossivel de enumerar, o mesmo
 * padrao ja usado para `Payment.simulatedTransactionId` (ADR-0012) e para
 * chaves de idempotencia neste projeto. Nao e sequencial, nao codifica o id
 * interno do ticket nem do hospede — conhecer um codigo valido nao revela
 * nada sobre outros.
 */
export function generateSecureTicketCode(): string {
  return `TICKET-${randomUUID()}`;
}
