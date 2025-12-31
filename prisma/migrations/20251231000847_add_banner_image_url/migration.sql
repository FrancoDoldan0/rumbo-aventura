/*
  Warnings:

  - You are about to drop the column `order` on the `ProductImage` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "ProductImage_productId_order_idx";

-- AlterTable
ALTER TABLE "ProductImage" DROP COLUMN "order",
ADD COLUMN     "size" INTEGER,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "ProductImage_productId_sortOrder_idx" ON "ProductImage"("productId", "sortOrder");
