-- Experiencia interna do cruzeiro: reserva de eventos e restaurantes, capacidade de experiencias
-- (ver docs/architecture/decisions/0014-onboard-activity-reservations.md).

-- CreateEnum
CREATE TYPE "ActivityReservationStatus" AS ENUM ('CONFIRMED', 'CANCELLED');

-- AlterTable: Experience ganha duracao.
ALTER TABLE "experiences" ADD COLUMN "durationMinutes" INTEGER;

-- AlterTable: BookingExperience ganha partySize (congelado, mesmo default de "1" para linhas ja
-- existentes — a mesma semantica de sempre valida: "pelo menos o titular participa").
ALTER TABLE "booking_experiences" ADD COLUMN "partySize" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "event_reservations" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "partySize" INTEGER NOT NULL,
    "status" "ActivityReservationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_reservations_eventId_bookingId_key" ON "event_reservations"("eventId", "bookingId");

-- CreateIndex
CREATE INDEX "event_reservations_eventId_idx" ON "event_reservations"("eventId");

-- CreateIndex
CREATE INDEX "event_reservations_bookingId_idx" ON "event_reservations"("bookingId");

-- AddForeignKey
ALTER TABLE "event_reservations" ADD CONSTRAINT "event_reservations_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_reservations" ADD CONSTRAINT "event_reservations_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "dining_reservations" (
    "id" TEXT NOT NULL,
    "diningSlotId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "partySize" INTEGER NOT NULL,
    "reservationDate" DATE NOT NULL,
    "status" "ActivityReservationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dining_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dining_reservations_diningSlotId_bookingId_reservationDate_key" ON "dining_reservations"("diningSlotId", "bookingId", "reservationDate");

-- CreateIndex
CREATE INDEX "dining_reservations_diningSlotId_reservationDate_idx" ON "dining_reservations"("diningSlotId", "reservationDate");

-- CreateIndex
CREATE INDEX "dining_reservations_bookingId_idx" ON "dining_reservations"("bookingId");

-- AddForeignKey
ALTER TABLE "dining_reservations" ADD CONSTRAINT "dining_reservations_diningSlotId_fkey" FOREIGN KEY ("diningSlotId") REFERENCES "dining_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dining_reservations" ADD CONSTRAINT "dining_reservations_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
