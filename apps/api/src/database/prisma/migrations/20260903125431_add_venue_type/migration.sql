-- CreateEnum
CREATE TYPE "VenueType" AS ENUM ('THEATER', 'LOUNGE', 'BAR', 'POOL', 'LEISURE', 'OTHER');

-- AlterTable
ALTER TABLE "venues" ADD COLUMN     "type" "VenueType" NOT NULL DEFAULT 'OTHER';
