-- WP1 master-spec foundation. HAND-WRITTEN (Prisma cannot express enum renames / data-preserving merges).
-- Every enum change maps existing rows losslessly; each block is its own transaction because ALTER TYPE ... ADD VALUE
-- values cannot be used in the transaction that adds them.
--
--   Role                 ADMIN -> FOUNDER (RENAME VALUE: User.role, RolePermission.role, TaskTemplateItem.ownerRole,
--                        Document.allowedRoles[], Announcement.audience[] all follow atomically)
--   EnquiryStage         CONTACTED -> NEW, CONSULTATION_SCHEDULED -> INITIAL_CONSULTATION, CONFIRMED -> CONVERTED
--   AgreementStatus      VOID -> EXPIRED (superseded versions), + REJECTED
--   QuotationStatus      (merged with RequestStatus) request: REQUESTED->SENT, RECEIVED->RECEIVED, ACCEPTED->SELECTED, NOT_SELECTED->CLOSED
--                        quotation: SUBMITTED->RECEIVED, ACCEPTED->SELECTED, REJECTED->REJECTED
--   TaskStatus           COMPLETED -> DONE, WAITING_FOR_VENDOR -> BLOCKED, UNDER_REVIEW -> IN_PROGRESS
--   RSVP                 YES -> CONFIRMED, NO -> DECLINED, MAYBE -> PENDING
--   ArrivalStatus        NOT_ARRIVED -> EXPECTED, + ON_THE_WAY
--   RoomAllocationStatus RESERVED -> CONFIRMED, + PENDING
--   IncidentStatus       OPEN -> REPORTED, + TRIAGED, ASSIGNED, CLOSED
--   ClientInvoiceStatus  VOID -> CANCELLED (OVERDUE stays in the enum but is derived at read time)
--   VendorBillStatus     + DRAFT, PARTIALLY_PAID
--   ApprovalType         + BUDGET_INCREASE

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Pure renames and additive values
-- ---------------------------------------------------------------------------------------------------------------
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE typname = 'Role' AND enumlabel = 'ADMIN')
     AND NOT EXISTS (SELECT 1 FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE typname = 'Role' AND enumlabel = 'FOUNDER') THEN
    ALTER TYPE "Role" RENAME VALUE 'ADMIN' TO 'FOUNDER';
  END IF;
END $$;
ALTER TYPE "AgreementStatus" RENAME VALUE 'VOID' TO 'EXPIRED';
ALTER TYPE "AgreementStatus" ADD VALUE IF NOT EXISTS 'REJECTED' BEFORE 'EXPIRED';
ALTER TYPE "ArrivalStatus" RENAME VALUE 'NOT_ARRIVED' TO 'EXPECTED';
ALTER TYPE "ArrivalStatus" ADD VALUE IF NOT EXISTS 'ON_THE_WAY' AFTER 'EXPECTED';
ALTER TYPE "RoomAllocationStatus" RENAME VALUE 'RESERVED' TO 'CONFIRMED';
ALTER TYPE "RoomAllocationStatus" ADD VALUE IF NOT EXISTS 'PENDING' BEFORE 'CONFIRMED';
ALTER TYPE "IncidentStatus" RENAME VALUE 'OPEN' TO 'REPORTED';
ALTER TYPE "IncidentStatus" ADD VALUE IF NOT EXISTS 'TRIAGED' AFTER 'REPORTED';
ALTER TYPE "IncidentStatus" ADD VALUE IF NOT EXISTS 'ASSIGNED' AFTER 'TRIAGED';
ALTER TYPE "IncidentStatus" ADD VALUE IF NOT EXISTS 'CLOSED' AFTER 'RESOLVED';
ALTER TYPE "ClientInvoiceStatus" RENAME VALUE 'VOID' TO 'CANCELLED';
ALTER TYPE "VendorBillStatus" ADD VALUE IF NOT EXISTS 'DRAFT' BEFORE 'SUBMITTED';
ALTER TYPE "VendorBillStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_PAID' AFTER 'APPROVED';
ALTER TYPE "ApprovalType" ADD VALUE IF NOT EXISTS 'BUDGET_INCREASE' BEFORE 'OTHER';
COMMIT;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Merging enums (a value is dropped, so create the new type and convert with an explicit CASE)
-- ---------------------------------------------------------------------------------------------------------------
BEGIN;

-- EnquiryStage
CREATE TYPE "EnquiryStage_new" AS ENUM ('NEW', 'INITIAL_CONSULTATION', 'PROPOSAL_SENT', 'NEGOTIATION', 'CONVERTED', 'LOST');
ALTER TABLE "Enquiry" ALTER COLUMN "stage" DROP DEFAULT;
ALTER TABLE "Enquiry" ALTER COLUMN "stage" TYPE "EnquiryStage_new" USING (CASE "stage"::text
  WHEN 'CONTACTED' THEN 'NEW'
  WHEN 'CONSULTATION_SCHEDULED' THEN 'INITIAL_CONSULTATION'
  WHEN 'CONFIRMED' THEN 'CONVERTED'
  ELSE "stage"::text END)::"EnquiryStage_new";
DROP TYPE "EnquiryStage";
ALTER TYPE "EnquiryStage_new" RENAME TO "EnquiryStage";
ALTER TABLE "Enquiry" ALTER COLUMN "stage" SET DEFAULT 'NEW';

-- TaskStatus
CREATE TYPE "TaskStatus_new" AS ENUM ('TO_PLAN', 'IN_PROGRESS', 'DONE', 'BLOCKED');
ALTER TABLE "WeddingTask" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "WeddingTask" ALTER COLUMN "status" TYPE "TaskStatus_new" USING (CASE "status"::text
  WHEN 'COMPLETED' THEN 'DONE'
  WHEN 'WAITING_FOR_VENDOR' THEN 'BLOCKED'
  WHEN 'UNDER_REVIEW' THEN 'IN_PROGRESS'
  ELSE "status"::text END)::"TaskStatus_new";
DROP TYPE "TaskStatus";
ALTER TYPE "TaskStatus_new" RENAME TO "TaskStatus";
ALTER TABLE "WeddingTask" ALTER COLUMN "status" SET DEFAULT 'TO_PLAN';

-- RSVP
CREATE TYPE "RSVP_new" AS ENUM ('PENDING', 'CONFIRMED', 'DECLINED');
ALTER TABLE "Guest" ALTER COLUMN "rsvp" DROP DEFAULT;
ALTER TABLE "Guest" ALTER COLUMN "rsvp" TYPE "RSVP_new" USING (CASE "rsvp"::text
  WHEN 'YES' THEN 'CONFIRMED'
  WHEN 'NO' THEN 'DECLINED'
  WHEN 'MAYBE' THEN 'PENDING'
  ELSE "rsvp"::text END)::"RSVP_new";
DROP TYPE "RSVP";
ALTER TYPE "RSVP_new" RENAME TO "RSVP";
ALTER TABLE "Guest" ALTER COLUMN "rsvp" SET DEFAULT 'PENDING';

-- QuotationStatus + RequestStatus -> one QuotationStatus
-- the partial unique index (one accepted request per RFQ group) is bound to the old enum type: rebuild it on SELECTED
DROP INDEX IF EXISTS "QuotationRequest_one_accepted_per_rfq";
CREATE TYPE "QuotationStatus_new" AS ENUM ('DRAFT', 'SENT', 'RECEIVED', 'UNDER_REVIEW', 'COMPARED', 'SELECTED', 'REJECTED', 'CLOSED', 'EXPIRED');
ALTER TABLE "QuotationRequest" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Quotation" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "QuotationRequest" ALTER COLUMN "status" TYPE "QuotationStatus_new" USING (CASE "status"::text
  WHEN 'REQUESTED' THEN 'SENT'
  WHEN 'RECEIVED' THEN 'RECEIVED'
  WHEN 'ACCEPTED' THEN 'SELECTED'
  WHEN 'NOT_SELECTED' THEN 'CLOSED'
  END)::"QuotationStatus_new";
ALTER TABLE "Quotation" ALTER COLUMN "status" TYPE "QuotationStatus_new" USING (CASE "status"::text
  WHEN 'SUBMITTED' THEN 'RECEIVED'
  WHEN 'ACCEPTED' THEN 'SELECTED'
  WHEN 'REJECTED' THEN 'REJECTED'
  END)::"QuotationStatus_new";
DROP TYPE "QuotationStatus";
DROP TYPE "RequestStatus";
ALTER TYPE "QuotationStatus_new" RENAME TO "QuotationStatus";
CREATE UNIQUE INDEX "QuotationRequest_one_accepted_per_rfq" ON "QuotationRequest" ("rfqGroup") WHERE "status" = 'SELECTED';
ALTER TABLE "QuotationRequest" ALTER COLUMN "status" SET DEFAULT 'SENT';
ALTER TABLE "Quotation" ALTER COLUMN "status" SET DEFAULT 'RECEIVED';

-- default values that follow renamed enum values (RENAME VALUE already rewrites the stored default expression; set explicitly for clarity)
ALTER TABLE "VendorArrival" ALTER COLUMN "status" SET DEFAULT 'EXPECTED';
ALTER TABLE "Incident" ALTER COLUMN "status" SET DEFAULT 'REPORTED';
ALTER TABLE "RoomAllocation" ALTER COLUMN "status" SET DEFAULT 'CONFIRMED';
COMMIT;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. New enums, columns, tables
-- ---------------------------------------------------------------------------------------------------------------
BEGIN;

CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'REFUNDED');
CREATE TYPE "VendorPaymentStatus" AS ENUM ('REQUESTED', 'APPROVED', 'SCHEDULED', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED');
CREATE TYPE "BookingStatus" AS ENUM ('DRAFT', 'AGREEMENT_PENDING', 'PROPOSAL_PENDING', 'DEPOSIT_PENDING', 'CONFIRMED', 'CANCELLED');
CREATE TYPE "ExecutionStage" AS ENUM ('INITIAL_PHASE', 'VENDOR_BOOKING', 'PLANNING', 'EVENT_DAY', 'FINANCIAL_CLOSEOUT', 'COMPLETED');
CREATE TYPE "WeddingFinancialStatus" AS ENUM ('NOT_STARTED', 'DEPOSIT_PENDING', 'PARTIALLY_PAID', 'FULLY_PAID', 'OVERDUE', 'CLOSED');
CREATE TYPE "EventFunctionStatus" AS ENUM ('UPCOMING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "FieldReportType" AS ENUM ('DAILY', 'TASK', 'EVENT');

-- DropForeignKey (re-added below with RESTRICT)
ALTER TABLE "ClientPayment" DROP CONSTRAINT "ClientPayment_weddingId_fkey";
ALTER TABLE "ClientPayment" DROP CONSTRAINT "ClientPayment_milestoneId_fkey";
ALTER TABLE "VendorPayment" DROP CONSTRAINT "VendorPayment_weddingId_fkey";
ALTER TABLE "VendorPayment" DROP CONSTRAINT "VendorPayment_weddingVendorId_fkey";
ALTER TABLE "AdditionalCharge" DROP CONSTRAINT "AdditionalCharge_reconciliationId_fkey";
ALTER TABLE "ClientInvoice" DROP CONSTRAINT "ClientInvoice_weddingId_fkey";
ALTER TABLE "VendorBill" DROP CONSTRAINT "VendorBill_weddingId_fkey";

-- AlterTable
ALTER TABLE "User" ADD COLUMN "notificationPrefs" JSONB;
ALTER TABLE "Couple" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Wedding" ADD COLUMN "bookingStatus" "BookingStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN "executionStage" "ExecutionStage" NOT NULL DEFAULT 'INITIAL_PHASE',
ADD COLUMN "financialStatus" "WeddingFinancialStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "story" TEXT;
ALTER TABLE "WeddingEvent" ADD COLUMN "endAt" TIMESTAMP(3),
ADD COLUMN "notes" TEXT,
ADD COLUMN "status" "EventFunctionStatus" NOT NULL DEFAULT 'UPCOMING';
ALTER TABLE "Agreement" ADD COLUMN "expiresAt" TIMESTAMP(3),
ADD COLUMN "rejectReason" TEXT,
ADD COLUMN "rejectedAt" TIMESTAMP(3);
ALTER TABLE "Vendor" ADD COLUMN "availabilityNotes" TEXT,
ADD COLUMN "blockedDates" TIMESTAMP(3)[],
ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ClientPayment" ADD COLUMN "gatewayRef" TEXT,
ADD COLUMN "invoiceId" TEXT,
ADD COLUMN "reversalOfId" TEXT,
ADD COLUMN "reversedAt" TIMESTAMP(3),
ADD COLUMN "status" "PaymentStatus" NOT NULL DEFAULT 'SUCCEEDED',
ADD COLUMN "verifiedAt" TIMESTAMP(3),
ADD COLUMN "verifiedById" TEXT;
ALTER TABLE "VendorPayment" ADD COLUMN "approvalId" TEXT,
ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "approvedById" TEXT,
ADD COLUMN "billId" TEXT,
ADD COLUMN "failureReason" TEXT,
ADD COLUMN "notes" TEXT,
ADD COLUMN "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "requestedById" TEXT,
ADD COLUMN "reversalOfId" TEXT,
ADD COLUMN "reversedAt" TIMESTAMP(3),
ADD COLUMN "scheduledFor" TIMESTAMP(3),
ADD COLUMN "status" "VendorPaymentStatus" NOT NULL DEFAULT 'PAID',
ALTER COLUMN "paidAt" DROP NOT NULL;
ALTER TABLE "Expense" ADD COLUMN "reversalOfId" TEXT,
ADD COLUMN "reversedAt" TIMESTAMP(3);
ALTER TABLE "Approval" ADD COLUMN "assignedApproverId" TEXT,
ADD COLUMN "reason" TEXT,
ADD COLUMN "reference" TEXT,
ADD COLUMN "sourceId" TEXT,
ADD COLUMN "sourceModule" TEXT,
ADD COLUMN "supportingDocumentId" TEXT;
ALTER TABLE "FeedbackRequest" ADD COLUMN "category" TEXT;
ALTER TABLE "Checklist" ADD COLUMN "eventId" TEXT;
ALTER TABLE "Proposal" ADD COLUMN "templateId" TEXT;
ALTER TABLE "VendorReview" ADD COLUMN "respondedAt" TIMESTAMP(3),
ADD COLUMN "response" TEXT;

-- CreateTable
CREATE TABLE "EventVendor" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "weddingVendorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventVendor_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "VendorDeliverable" (
    "id" TEXT NOT NULL,
    "weddingVendorId" TEXT NOT NULL,
    "quotationItemId" TEXT,
    "title" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "doneById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VendorDeliverable_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "VendorBillPayment" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotencyKey" TEXT NOT NULL,
    "vendorPaymentId" TEXT,
    "recordedById" TEXT,
    "reversalOfId" TEXT,
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VendorBillPayment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AnnouncementRead" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnnouncementRead_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "FeedbackReply" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeedbackReply_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "FieldReport" (
    "id" TEXT NOT NULL,
    "type" "FieldReportType" NOT NULL,
    "weddingId" TEXT,
    "authorId" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "progress" INTEGER,
    "issues" TEXT,
    "nextSteps" TEXT,
    "taskId" TEXT,
    "eventId" TEXT,
    "attendance" INTEGER,
    "photoDocumentIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FieldReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventVendor_weddingVendorId_idx" ON "EventVendor"("weddingVendorId");
CREATE UNIQUE INDEX "EventVendor_eventId_weddingVendorId_key" ON "EventVendor"("eventId", "weddingVendorId");
CREATE INDEX "VendorDeliverable_weddingVendorId_idx" ON "VendorDeliverable"("weddingVendorId");
CREATE UNIQUE INDEX "VendorDeliverable_weddingVendorId_quotationItemId_key" ON "VendorDeliverable"("weddingVendorId", "quotationItemId");
CREATE UNIQUE INDEX "VendorBillPayment_idempotencyKey_key" ON "VendorBillPayment"("idempotencyKey");
CREATE INDEX "VendorBillPayment_billId_idx" ON "VendorBillPayment"("billId");
CREATE INDEX "VendorBillPayment_vendorPaymentId_idx" ON "VendorBillPayment"("vendorPaymentId");
CREATE INDEX "AnnouncementRead_userId_idx" ON "AnnouncementRead"("userId");
CREATE UNIQUE INDEX "AnnouncementRead_announcementId_userId_key" ON "AnnouncementRead"("announcementId", "userId");
CREATE INDEX "FeedbackReply_feedbackId_createdAt_idx" ON "FeedbackReply"("feedbackId", "createdAt");
CREATE INDEX "FieldReport_weddingId_createdAt_idx" ON "FieldReport"("weddingId", "createdAt");
CREATE INDEX "FieldReport_authorId_idx" ON "FieldReport"("authorId");
CREATE INDEX "FieldReport_type_idx" ON "FieldReport"("type");
CREATE INDEX "Wedding_bookingStatus_idx" ON "Wedding"("bookingStatus");
CREATE INDEX "Wedding_executionStage_idx" ON "Wedding"("executionStage");
CREATE INDEX "ClientPayment_invoiceId_idx" ON "ClientPayment"("invoiceId");
CREATE INDEX "ClientPayment_status_idx" ON "ClientPayment"("status");
CREATE INDEX "ClientPayment_reversalOfId_idx" ON "ClientPayment"("reversalOfId");
CREATE INDEX "VendorPayment_status_idx" ON "VendorPayment"("status");
CREATE INDEX "VendorPayment_billId_idx" ON "VendorPayment"("billId");
CREATE INDEX "VendorPayment_reversalOfId_idx" ON "VendorPayment"("reversalOfId");
CREATE UNIQUE INDEX "Approval_reference_key" ON "Approval"("reference");
CREATE INDEX "Approval_sourceModule_sourceId_idx" ON "Approval"("sourceModule", "sourceId");
CREATE INDEX "Approval_assignedApproverId_idx" ON "Approval"("assignedApproverId");
CREATE INDEX "FeedbackRequest_category_idx" ON "FeedbackRequest"("category");
CREATE INDEX "Checklist_eventId_idx" ON "Checklist"("eventId");

-- AddForeignKey
ALTER TABLE "EventVendor" ADD CONSTRAINT "EventVendor_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "WeddingEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventVendor" ADD CONSTRAINT "EventVendor_weddingVendorId_fkey" FOREIGN KEY ("weddingVendorId") REFERENCES "WeddingVendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendorDeliverable" ADD CONSTRAINT "VendorDeliverable_weddingVendorId_fkey" FOREIGN KEY ("weddingVendorId") REFERENCES "WeddingVendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendorDeliverable" ADD CONSTRAINT "VendorDeliverable_quotationItemId_fkey" FOREIGN KEY ("quotationItemId") REFERENCES "QuotationItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClientPayment" ADD CONSTRAINT "ClientPayment_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "Wedding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientPayment" ADD CONSTRAINT "ClientPayment_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "PaymentMilestone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientPayment" ADD CONSTRAINT "ClientPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "ClientInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientPayment" ADD CONSTRAINT "ClientPayment_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "ClientPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VendorPayment" ADD CONSTRAINT "VendorPayment_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "Wedding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VendorPayment" ADD CONSTRAINT "VendorPayment_weddingVendorId_fkey" FOREIGN KEY ("weddingVendorId") REFERENCES "WeddingVendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VendorPayment" ADD CONSTRAINT "VendorPayment_billId_fkey" FOREIGN KEY ("billId") REFERENCES "VendorBill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VendorPayment" ADD CONSTRAINT "VendorPayment_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "Approval"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VendorPayment" ADD CONSTRAINT "VendorPayment_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "VendorPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "Expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdditionalCharge" ADD CONSTRAINT "AdditionalCharge_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "Reconciliation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_supportingDocumentId_fkey" FOREIGN KEY ("supportingDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_assignedApproverId_fkey" FOREIGN KEY ("assignedApproverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClientInvoice" ADD CONSTRAINT "ClientInvoice_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "Wedding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VendorBill" ADD CONSTRAINT "VendorBill_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "Wedding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VendorBillPayment" ADD CONSTRAINT "VendorBillPayment_billId_fkey" FOREIGN KEY ("billId") REFERENCES "VendorBill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VendorBillPayment" ADD CONSTRAINT "VendorBillPayment_vendorPaymentId_fkey" FOREIGN KEY ("vendorPaymentId") REFERENCES "VendorPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VendorBillPayment" ADD CONSTRAINT "VendorBillPayment_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "VendorBillPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AnnouncementRead" ADD CONSTRAINT "AnnouncementRead_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnnouncementRead" ADD CONSTRAINT "AnnouncementRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedbackReply" ADD CONSTRAINT "FeedbackReply_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "FeedbackRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedbackReply" ADD CONSTRAINT "FeedbackReply_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Checklist" ADD CONSTRAINT "Checklist_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "WeddingEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FieldReport" ADD CONSTRAINT "FieldReport_weddingId_fkey" FOREIGN KEY ("weddingId") REFERENCES "Wedding"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FieldReport" ADD CONSTRAINT "FieldReport_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FieldReport" ADD CONSTRAINT "FieldReport_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "WeddingEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
COMMIT;

-- ---------------------------------------------------------------------------------------------------------------
-- 4. Data backfills (new enum values from step 1 are usable now that it has committed)
-- ---------------------------------------------------------------------------------------------------------------
BEGIN;

-- Weddings: the existing rows are live bookings. Cancelled stays cancelled; everything else is CONFIRMED.
UPDATE "Wedding" SET "bookingStatus" = CASE WHEN "status"::text = 'CANCELLED' THEN 'CANCELLED'::"BookingStatus" ELSE 'CONFIRMED'::"BookingStatus" END;
-- Execution stage derives from the legacy combined status (a completed wedding whose reconciliation is still open is in financial closeout).
UPDATE "Wedding" w SET "executionStage" = CASE w."status"::text
  WHEN 'PLANNING' THEN 'PLANNING'::"ExecutionStage"
  WHEN 'VENDOR_BOOKING' THEN 'VENDOR_BOOKING'::"ExecutionStage"
  WHEN 'EVENT_DAY' THEN 'EVENT_DAY'::"ExecutionStage"
  WHEN 'COMPLETED' THEN (CASE WHEN EXISTS (SELECT 1 FROM "Reconciliation" r WHERE r."weddingId" = w."id" AND r."status"::text = 'OPEN') THEN 'FINANCIAL_CLOSEOUT' ELSE 'COMPLETED' END)::"ExecutionStage"
  ELSE 'INITIAL_PHASE'::"ExecutionStage" END;
-- Financial status from milestones and payments.
UPDATE "Wedding" w SET "financialStatus" = CASE
  WHEN w."status"::text = 'CANCELLED' THEN 'CLOSED'
  WHEN NOT EXISTS (SELECT 1 FROM "PaymentMilestone" m WHERE m."weddingId" = w."id") THEN 'NOT_STARTED'
  WHEN NOT EXISTS (SELECT 1 FROM "PaymentMilestone" m WHERE m."weddingId" = w."id" AND m."status"::text <> 'PAID') THEN
    (CASE WHEN EXISTS (SELECT 1 FROM "Reconciliation" r WHERE r."weddingId" = w."id" AND r."status"::text = 'CLOSED') THEN 'CLOSED' ELSE 'FULLY_PAID' END)
  WHEN EXISTS (SELECT 1 FROM "PaymentMilestone" m WHERE m."weddingId" = w."id" AND m."status"::text = 'OVERDUE') THEN 'OVERDUE'
  WHEN EXISTS (SELECT 1 FROM "ClientPayment" p WHERE p."weddingId" = w."id") THEN 'PARTIALLY_PAID'
  ELSE 'DEPOSIT_PENDING' END::"WeddingFinancialStatus";

-- Existing client payments were recorded as received money: verified at the time they were paid.
UPDATE "ClientPayment" SET "verifiedAt" = "paidAt", "verifiedById" = "recordedById" WHERE "status" = 'SUCCEEDED';
-- Invoice linkage that used to live in the idempotency key prefix  inv:<invoiceId>:<key>
UPDATE "ClientPayment" p SET "invoiceId" = i."id" FROM "ClientInvoice" i WHERE p."idempotencyKey" LIKE 'inv:%' AND p."idempotencyKey" LIKE 'inv:' || i."id" || ':%';

-- Vendor payments that already exist were executed: record who/when as requester + approver = recorder.
UPDATE "VendorPayment" SET "requestedById" = "recordedById", "requestedAt" = COALESCE("paidAt", "createdAt"), "approvedById" = "recordedById", "approvedAt" = "paidAt";
-- Link vendor payments created through bill payments (idempotency key  bill:<billId>:<key>) to their bill.
UPDATE "VendorPayment" p SET "billId" = b."id" FROM "VendorBill" b WHERE p."idempotencyKey" LIKE 'bill:%' AND p."idempotencyKey" LIKE 'bill:' || b."id" || ':%';

-- Vendor bill payments used to be ActivityLog 'pay' rows; materialise them (key is made globally unique per bill).
INSERT INTO "VendorBillPayment" ("id", "billId", "amount", "method", "reference", "paidAt", "idempotencyKey", "vendorPaymentId", "recordedById", "createdAt")
SELECT gen_random_uuid()::text, a."entityId", (a."meta"->>'amount')::numeric, COALESCE(NULLIF(a."meta"->>'method', ''), 'OTHER')::"PaymentMethod", a."meta"->>'reference', a."createdAt",
       'bill:' || a."entityId" || ':' || (a."meta"->>'idempotencyKey'),
       (SELECT vp."id" FROM "VendorPayment" vp WHERE vp."id" = a."meta"->>'vendorPaymentId'), a."actorId", a."createdAt"
FROM "ActivityLog" a
WHERE a."entity" = 'VendorBill' AND a."action" = 'pay' AND a."entityId" IS NOT NULL AND a."meta" ? 'idempotencyKey' AND a."meta" ? 'amount'
  AND EXISTS (SELECT 1 FROM "VendorBill" b WHERE b."id" = a."entityId")
ON CONFLICT ("idempotencyKey") DO NOTHING;

-- Approvals: reference, source pointer, reason; budget-increase approvals used type OTHER with entity Budget.
UPDATE "Approval" SET "type" = 'BUDGET_INCREASE' WHERE "type"::text = 'OTHER' AND "entity" = 'Budget';
UPDATE "Approval" a SET "reference" = 'APR-' || to_char(r."createdAt", 'YYYY') || '-' || lpad(r."n"::text, 4, '0')
  FROM (SELECT "id", "createdAt", row_number() OVER (PARTITION BY to_char("createdAt", 'YYYY') ORDER BY "createdAt", "id") AS n FROM "Approval") r
  WHERE a."id" = r."id" AND a."reference" IS NULL;
UPDATE "Approval" SET "sourceModule" = "entity", "sourceId" = "entityId" WHERE "entity" IS NOT NULL;
UPDATE "Approval" SET "reason" = "description" WHERE "reason" IS NULL;
COMMIT;

-- ---------------------------------------------------------------------------------------------------------------
-- 5. Audit immutability: ActivityLog is append-only.
--    * UPDATE and DELETE are rejected.
--    * The only tolerated UPDATE is the referential action ON DELETE SET NULL on actorId / weddingId (deleting a user or an
--      unbilled demo wedding must keep working) and nothing else may change in that statement.
--    * Maintenance escape hatch for the seed's backdating: run   SET LOCAL app.audit_maintenance = 'on'   inside a transaction.
--      The application never sets it.
--    * TRUNCATE (seed reset / test databases) is not row-level and is intentionally not covered.
-- ---------------------------------------------------------------------------------------------------------------
BEGIN;
CREATE OR REPLACE FUNCTION activitylog_append_only() RETURNS trigger AS $$
BEGIN
  IF current_setting('app.audit_maintenance', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW."id" IS NOT DISTINCT FROM OLD."id"
     AND NEW."entity" IS NOT DISTINCT FROM OLD."entity"
     AND NEW."entityId" IS NOT DISTINCT FROM OLD."entityId"
     AND NEW."action" IS NOT DISTINCT FROM OLD."action"
     AND NEW."message" IS NOT DISTINCT FROM OLD."message"
     AND NEW."meta" IS NOT DISTINCT FROM OLD."meta"
     AND NEW."createdAt" IS NOT DISTINCT FROM OLD."createdAt"
     AND (NEW."actorId" IS NOT DISTINCT FROM OLD."actorId" OR NEW."actorId" IS NULL)
     AND (NEW."weddingId" IS NOT DISTINCT FROM OLD."weddingId" OR NEW."weddingId" IS NULL) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'ActivityLog is append-only: % is not allowed', TG_OP USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ActivityLog_append_only" BEFORE UPDATE OR DELETE ON "ActivityLog"
  FOR EACH ROW EXECUTE FUNCTION activitylog_append_only();
COMMIT;
