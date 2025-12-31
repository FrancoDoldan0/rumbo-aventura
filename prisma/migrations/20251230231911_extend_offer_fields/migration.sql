-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "discountType" TEXT,
ADD COLUMN     "discountVal" DOUBLE PRECISION,
ADD COLUMN     "endAt" TIMESTAMP(3),
ADD COLUMN     "startAt" TIMESTAMP(3);
