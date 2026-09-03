-- Separa "preco" (subtotal: cabine + adicionais, antes de desconto/taxa) de
-- "total" (totalAmount, que ja existia e agora passa a significar de fato o
-- total final) — ver ADR-0010 e BookingPricingPolicy. discountAmount/
-- feeAmount passam a ser sempre calculados (nunca NULL): backfill com 0
-- para as linhas existentes, que foram criadas antes deste conceito existir.
ALTER TABLE "bookings" ADD COLUMN "subtotalAmount" DECIMAL(10,2);
UPDATE "bookings" SET "subtotalAmount" = "totalAmount" WHERE "subtotalAmount" IS NULL;
ALTER TABLE "bookings" ALTER COLUMN "subtotalAmount" SET NOT NULL;

UPDATE "bookings" SET "discountAmount" = 0 WHERE "discountAmount" IS NULL;
ALTER TABLE "bookings" ALTER COLUMN "discountAmount" SET NOT NULL;
ALTER TABLE "bookings" ALTER COLUMN "discountAmount" SET DEFAULT 0;

UPDATE "bookings" SET "feeAmount" = 0 WHERE "feeAmount" IS NULL;
ALTER TABLE "bookings" ALTER COLUMN "feeAmount" SET NOT NULL;
ALTER TABLE "bookings" ALTER COLUMN "feeAmount" SET DEFAULT 0;
