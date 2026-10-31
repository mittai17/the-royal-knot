-- Only one accepted vendor request per RFQ group (backs the transactional selection).
CREATE UNIQUE INDEX "QuotationRequest_one_accepted_per_rfq" ON "QuotationRequest" ("rfqGroup") WHERE "status" = 'ACCEPTED';

-- Money sanity checks.
ALTER TABLE "ClientPayment" ADD CONSTRAINT "ClientPayment_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "VendorPayment" ADD CONSTRAINT "VendorPayment_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "PaymentMilestone" ADD CONSTRAINT "PaymentMilestone_expected_nonneg" CHECK ("expectedAmount" >= 0);
