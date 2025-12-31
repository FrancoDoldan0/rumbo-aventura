/*
  Warnings:

  - You are about to drop the column `sortOrder` on the `ProductImage` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "ProductImage_productId_sortOrder_idx";

-- AlterTable
ALTER TABLE "ProductImage" DROP COLUMN "sortOrder",
ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "ProductImage_productId_order_idx" ON "ProductImage"("productId", "order");
