# Entity Relationship Plan — The Royal Knot

Money: `Decimal(14,2)` INR everywhere. Timestamps stored UTC (`timestamptz` via Prisma DateTime). IDs are UUIDs.

## Identity / team
- **User** (role enum: ADMIN, PLANNER, EVENT_MANAGER, FINANCE, OPERATIONS; status ACTIVE/DISABLED). 1—N **RefreshToken** (hash, family, rotation + reuse detection).
- **Team** 1—N **TeamMember** N—1 User. Roles/permissions: the role enum is the role table; the permission matrix is `src/common/permissions.ts` (no Permission table — documented simplification).

## CRM
- **Couple** (names, contact). **Enquiry** N—1 Couple, N—1 User(assignedTo), 1—N **EnquiryActivity**; `convertedWeddingId` set on conversion.
- Enquiry stage never deleted (LOST is a stage) → nothing disappears from the pipeline.

## Wedding core
- **Wedding** N—1 Couple, N—1 User(planner), optional 1—1 Enquiry. 1—N **WeddingEvent** (Mehendi/Sangeet/Ceremony/Reception).
- **Agreement** N—1 Wedding, N—1 **AgreementTemplate**, 1—N **AgreementSignature**; versioned; PDF stored as **Document**.
- **WeddingVendor** (Wedding × Vendor × category; unique) holds contract amount; 1—1 **VendorArrival**.

## Vendors & quotations
- **Vendor** 1—N **VendorService** (priced services). Rating + reliability updated from arrivals.
- **QuotationRequest** (one per invited vendor, shares `rfqGroup` with its siblings) 1—1 **Quotation** 1—N **QuotationItem**. Selecting a quotation (transaction): ACCEPTED, siblings → NOT_SELECTED, upsert WeddingVendor. Everything preserved; `ActivityLog` records the decision.

## Planning
- **TaskTemplate** 1—N **TaskTemplateItem** (key, offsetDays, dependsOnKey). **WeddingTask** unique(weddingId, templateKey) → idempotent generation. **TaskDependency**(task, dependsOn).

## Event ops
- **TimelineItem** (wedding, optional event), **VendorArrival**, **Incident** (+ audit in ActivityLog). All persisted before Socket.IO broadcast.

## Guests
- **Guest** (group, category, invitation, rsvp, plusOnes, check-in). Expected = invited head-count, Confirmed = RSVP YES (+plus-ones), Actual = checked-in.

## Finance
- **PaymentMilestone** unique(wedding,type BOOKING/ADVANCE/FINAL) 1—N **ClientPayment** (unique idempotencyKey, receiptNo).
- **VendorPayment** (unique idempotencyKey) N—1 WeddingVendor.
- **Expense**, **BudgetLine** (planned vs actual by category).
- **Reconciliation** (1 per wedding) 1—N **VendorSettlement** (per WeddingVendor), 1—N **AdditionalCharge** (extra plates, overtime…; `billToClient`, `approved`).

## Platform
- **Document** (MinIO objectKey, versioned via `documentKey`+`version`, allowedRoles). **Notification** (per user, unique dedupeKey). **ActivityLog** (audit).
