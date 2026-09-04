-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TICKET_AVAILABLE' BEFORE 'ITINERARY_CHANGED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BOOKING_CANCELLED' BEFORE 'GENERIC';

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN "deliveryStatus" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "notifications" ADD COLUMN "deliveryError" TEXT;
ALTER TABLE "notifications" ADD COLUMN "sentAt" TIMESTAMP(3);
