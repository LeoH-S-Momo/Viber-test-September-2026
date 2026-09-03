-- Preco: taxa de servico persistida (parte do calculo de total — ver
-- BookingPricingPolicy) e chave de idempotencia opcional, unica por usuario.
ALTER TABLE "bookings" ADD COLUMN "feeAmount" DECIMAL(10,2);
ALTER TABLE "bookings" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "bookings_userId_idempotencyKey_key" ON "bookings"("userId", "idempotencyKey");

-- Adicionais (Experience) selecionados numa reserva, com preco congelado no
-- momento da selecao.
CREATE TABLE "booking_experiences" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "experienceId" TEXT NOT NULL,
    "priceAtBooking" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_experiences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "booking_experiences_bookingId_experienceId_key" ON "booking_experiences"("bookingId", "experienceId");

ALTER TABLE "booking_experiences" ADD CONSTRAINT "booking_experiences_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_experiences" ADD CONSTRAINT "booking_experiences_experienceId_fkey" FOREIGN KEY ("experienceId") REFERENCES "experiences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Amplia o indice unico parcial de concorrencia (ADR-0009) para tambem
-- bloquear durante PAYMENT_PENDING — a cabine continua reservada enquanto o
-- pagamento (simulado) esta em andamento, nao so durante HELD.
DROP INDEX "booking_active_cabin_per_cruise";
CREATE UNIQUE INDEX "booking_active_cabin_per_cruise" ON "bookings" ("cabinId", "cruiseId") WHERE "status" IN ('HELD', 'PAYMENT_PENDING', 'CONFIRMED');

-- @@index([userId]) antigo de `bookings` fica redundante: o novo indice
-- unico (userId, idempotencyKey) ja cobre consultas por userId sozinho
-- (leftmost prefix) — dropado para nao manter dois indices equivalentes.
DROP INDEX IF EXISTS "bookings_userId_idx";
