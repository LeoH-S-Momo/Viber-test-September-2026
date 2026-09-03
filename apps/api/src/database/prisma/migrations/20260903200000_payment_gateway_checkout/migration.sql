-- Checkout completo via PaymentGateway (ver docs/architecture/decisions/0012-checkout-payment-gateway.md):
-- Payment ganha o motivo de recusa devolvido pelo gateway simulado.

-- AlterTable
ALTER TABLE "payments" ADD COLUMN "failureReason" TEXT;
