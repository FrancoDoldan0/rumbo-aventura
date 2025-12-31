/*
  Warnings:

  - You are about to drop the column `order` on the `Banner` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Banner" DROP COLUMN "order",
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;
