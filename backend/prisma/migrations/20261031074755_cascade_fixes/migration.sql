-- DropForeignKey
ALTER TABLE "ClientPayment" DROP CONSTRAINT "ClientPayment_milestoneId_fkey";

-- DropForeignKey
ALTER TABLE "VendorPayment" DROP CONSTRAINT "VendorPayment_weddingVendorId_fkey";

-- DropForeignKey
ALTER TABLE "VendorSettlement" DROP CONSTRAINT "VendorSettlement_weddingVendorId_fkey";

-- AddForeignKey
ALTER TABLE "ClientPayment" ADD CONSTRAINT "ClientPayment_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "PaymentMilestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPayment" ADD CONSTRAINT "VendorPayment_weddingVendorId_fkey" FOREIGN KEY ("weddingVendorId") REFERENCES "WeddingVendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorSettlement" ADD CONSTRAINT "VendorSettlement_weddingVendorId_fkey" FOREIGN KEY ("weddingVendorId") REFERENCES "WeddingVendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
