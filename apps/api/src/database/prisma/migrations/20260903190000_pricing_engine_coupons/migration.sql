-- Motor de precos (ver docs/architecture/decisions/0011-pricing-engine.md):
-- cupom ganha valor minimo de compra e limite de uso por usuario, e "cruzeiros
-- aplicaveis" vira many-to-many (varios cruzeiros por cupom) em vez da coluna
-- singular "cruiseId".

-- AlterTable
ALTER TABLE "coupons" ADD COLUMN "minPurchaseAmount" DECIMAL(10,2);
ALTER TABLE "coupons" ADD COLUMN "maxUsesPerUser" INTEGER;

-- CreateTable
CREATE TABLE "coupon_cruises" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "cruiseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_cruises_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "coupon_cruises_couponId_cruiseId_key" ON "coupon_cruises"("couponId", "cruiseId");

-- CreateIndex
CREATE INDEX "coupon_cruises_cruiseId_idx" ON "coupon_cruises"("cruiseId");

-- AddForeignKey
ALTER TABLE "coupon_cruises" ADD CONSTRAINT "coupon_cruises_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_cruises" ADD CONSTRAINT "coupon_cruises_cruiseId_fkey" FOREIGN KEY ("cruiseId") REFERENCES "cruises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: cupom que ja tinha um cruiseId singular (escopo unico) vira uma
-- linha na nova tabela — preserva o comportamento existente de cada cupom.
INSERT INTO "coupon_cruises" ("id", "couponId", "cruiseId", "createdAt")
SELECT gen_random_uuid()::text, "id", "cruiseId", now() FROM "coupons" WHERE "cruiseId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "coupons" DROP CONSTRAINT "coupons_cruiseId_fkey";

-- AlterTable
ALTER TABLE "coupons" DROP COLUMN "cruiseId";
