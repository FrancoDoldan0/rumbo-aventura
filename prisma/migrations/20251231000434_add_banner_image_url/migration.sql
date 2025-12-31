/*
  Warnings:

  - Added the required column `imageUrl` to the `Banner` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "BannerPlacement" AS ENUM ('HOME', 'PRODUCTS', 'CATEGORY', 'CHECKOUT');

-- DropIndex
DROP INDEX "Banner_isActive_categoryId_idx";

-- AlterTable
ALTER TABLE "Banner" ADD COLUMN     "endAt" TIMESTAMP(3),
ADD COLUMN     "imageUrl" TEXT NOT NULL,
ADD COLUMN     "placement" "BannerPlacement" NOT NULL DEFAULT 'HOME',
ADD COLUMN     "startAt" TIMESTAMP(3);
