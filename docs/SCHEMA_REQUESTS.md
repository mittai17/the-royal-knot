
## Agent C (communications / content / clients / proposals)
Nothing blocks delivery; these are workarounds that a schema change would clean up:
- `FeedbackRequest.category String?`: category is stored as a `[Category] ` prefix of `subject` (encode/decode in `backend/src/modules/feedback/category.ts`).
- `AnnouncementRead { announcementId, userId, readAt }`: read state is derived from the per-user `Notification` row with `dedupeKey = "ann:<id>"` created at publish time.
- `FeedbackReply { feedbackId, authorId, body, createdAt }`: only one staff `response` string is kept per request (a new reply replaces it).
- `Proposal.templateId`: the agreement template is chosen at send time and not stored.

## Portal Client / Vendor (agent D)
Nothing blocks delivery; these state items live in `SystemSetting` JSON until a proper column/table exists:
- `VendorReview.response String?` + `respondedAt DateTime?`: vendor replies are kept in `SystemSetting` key `vendor.review.response.<reviewId>`.
- `WeddingVendor.deliverables Json?` (or a `VendorDeliverable { weddingVendorId, quotationItemId, done, doneAt, note }` table): the done/not-done state of service deliverables is kept in `SystemSetting` key `vendor.deliverables.<weddingVendorId>`; the checklist itself is derived from the accepted quotation's included lines.
- `Vendor.blockedDates DateTime[]` + `availabilityNotes String?`: availability calendar is kept in `SystemSetting` key `vendor.availability.<vendorId>`.
- `Wedding.story String?`: the couple's "Our story" text is kept in `SystemSetting` key `portal.story.<weddingId>`.
- `User.notificationPrefs Json?`: notification preferences are kept in `SystemSetting` key `user.prefs.<userId>` (shared helper `backend/src/common/portal-settings.ts`).

## Event operations & logistics (agent B)
Worked around with existing fields; a proper schema would be cleaner:
1. `WeddingEvent` (event functions): add `endAt DateTime?`, `status` (UPCOMING/IN_PROGRESS/COMPLETED/CANCELLED), `notes String?`, and a join table `EventVendor(eventId, weddingVendorId)`. Today these live in `SystemSetting` under key `fn:<eventId>` as JSON `{status,endAt,notes,vendorIds}` (removed when the function is deleted).
2. `Checklist`: add `eventId String?` so a checklist can belong to one function. Today the convention is a name prefix `[Function name] ...`.
3. Updates & Reports (daily update, task report, event report): add a `FieldReport` table (type, weddingId, authorId, title, summary, progress, issues, nextSteps, taskId, eventId, attendance, photo document ids). Today they are `ActivityLog` rows with entity `FieldReport`, action `daily|task|event` and the payload in `meta`.

## Finance agent (A)
- `ApprovalType`: add `BUDGET_INCREASE`. Budget-increase approvals currently use `OTHER` with entity `Budget`.
- `ClientPayment`: optional `invoiceId` (FK to `ClientInvoice`). Invoice payments are currently linked by the `idempotencyKey` prefix `inv:<invoiceId>:` and `ClientInvoice.amountPaid` is kept in step under a row lock.
- `VendorBill`: a `VendorBillPayment` table (amount, method, reference, paidAt, idempotencyKey). Bill payments are currently recorded in `ActivityLog` (action `pay`, `meta.idempotencyKey`) and, for wedding-linked bills, as a `VendorPayment`.
