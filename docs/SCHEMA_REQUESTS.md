
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

---

## Status: folded into migration `20261101090000_master_spec_foundation` (WP1)

All requests above are now real columns/tables. The old workarounds still work and are NOT removed yet; later packages should switch to the columns and delete the workaround code.

| Request | Now available |
|---|---|
| `FeedbackRequest.category` | column `category` (+ index) |
| `AnnouncementRead` | table `AnnouncementRead(announcementId, userId, readAt)`, unique per user |
| `FeedbackReply` | table `FeedbackReply(feedbackId, authorId, body, createdAt)` |
| `Proposal.templateId` | column `templateId` |
| `VendorReview.response / respondedAt` | columns |
| vendor deliverables | table `VendorDeliverable(weddingVendorId, quotationItemId?, title, done, doneAt, doneById, note)` |
| `Vendor.blockedDates / availabilityNotes` | columns |
| `Wedding.story` | column |
| `User.notificationPrefs` | `Json?` column |
| `WeddingEvent` endAt/status/notes + vendors | columns `endAt`, `status` (`EventFunctionStatus`), `notes`; join table `EventVendor(eventId, weddingVendorId)` |
| `Checklist.eventId` | column + relation |
| `FieldReport` | table + enum `FieldReportType` (DAILY, TASK, EVENT) |
| `ApprovalType.BUDGET_INCREASE` | enum value (existing `OTHER`/`Budget` rows were migrated) |
| `ClientPayment.invoiceId` | FK to `ClientInvoice` (backfilled from the `inv:<id>:` key prefix) |
| `VendorBillPayment` | table (backfilled from ActivityLog `pay` rows; key = `bill:<billId>:<original key>`) |

### Integrity notes

* `ActivityLog` is append-only: a trigger (`ActivityLog_append_only`) rejects UPDATE and DELETE. The only tolerated UPDATE is the FK action `ON DELETE SET NULL` on `actorId` / `weddingId` (so deleting a user or a wedding keeps working). The seed backdates its demo history inside a transaction that runs `SELECT set_config('app.audit_maintenance','on',true)`; the application never sets that.
* Posted financial records use `ON DELETE RESTRICT` from `Wedding` / `PaymentMilestone` / `WeddingVendor` / `Reconciliation`: `ClientPayment`, `VendorPayment`, `ClientInvoice`, `VendorBill`, `VendorBillPayment`, `AdditionalCharge`. A wedding that has any of these can no longer be deleted (the database refuses). A demo or empty wedding (no payments, invoices, bills, charges) can still be deleted; weddings cascade their milestones, tasks, guests, events etc. as before. There is no wedding-delete endpoint today. Test suites that delete weddings clear financial rows first (see `afterAll` in `backend/test/*.e2e-spec.ts`). `npm run seed:reset` (TRUNCATE ... CASCADE) is unaffected by FK actions and triggers.
* Reversal support: `reversalOfId` + `reversedAt` on `ClientPayment`, `VendorPayment`, `VendorBillPayment`, `Expense` (a reversal is a new row pointing at the original; self FK is RESTRICT).


---

## WP2 (workflow backend)

Nothing blocks delivery; these are workarounds that a schema change would clean up:
1. `WeddingAssignment { weddingId, userId, role, assignedById, createdAt }` (unique `weddingId,userId`): staff access (PLANNER, EVENT_MANAGER, OPERATIONS) is derived from `Wedding.plannerId`, `WeddingTask.ownerId` and `Incident.assignedToId` (see `ScopeService.weddingWhere`). `POST /weddings/:id/assign` hands the open tasks of the user's role to them. An explicit table would let an event manager be assigned before the checklist exists (draft stage) and make `weddingWhere` a single indexed join.
2. `Quotation` client decision: the couple's preferred quotation is an `ActivityLog` row (`entity Quotation`, `action client.select`, `meta.rfqGroup`). Wanted: `QuotationRequest.clientSelectedAt` + `clientSelectedById` (or `Quotation.clientSelected Boolean`).
3. Per-RFQ decision history (competing RFQs closed on selection) is one `ActivityLog` row per closed request (`action rfq.close`). Wanted: `QuotationDecision { rfqGroup, quotationId, decidedById, decidedAt, note }`.
4. `Wedding.confirmedAt DateTime?` / `confirmedById String?`: confirmation is recorded in `ActivityLog` (`entity Wedding`, `action confirm`).
5. `Document.lockedUntilAgreement Boolean` is NOT needed: FLOOR_PLAN is gated by category.
6. Day-of as a subtype of Partial: `Wedding.packageSubtype` (e.g. `DAY_OF`) so the subtype is stored; today it is an option on `POST /weddings/:id/tasks/generate` (`{ subtype: 'DAY_OF' }`).
7. Procurement strictness flag: `SystemSetting` key `procurement.requireClientSelection` (`true`) makes the client selection step mandatory before the planner can select a vendor.

---

## WP3 (finance backend) — nothing blocks delivery; workarounds in use

1. `ApprovalType`: add `CLIENT_REFUND`, `CANCELLATION`, `SPECIAL_PURCHASE`. Today they are `OTHER` with `sourceModule` = `client-refund` | `cancellation` | `special-purchase` (the Approvals API takes `source` and maps it, see `SOURCE_MAP` in `modules/approvals/approvals.service.ts`).
2. `AdditionalCharge`: add `voidedAt DateTime?` and `voidOfId String?` (self FK). Today a void is a counter-entry with a negative `amount` and the description prefix `[VOID:<originalId>] `.
3. `ClientPayment`: add `provider String?` and a unique index on `(provider, gatewayRef)`. Today gateway idempotency is the unique `idempotencyKey = gw:<provider>:<gatewayRef>`.
4. Per-contract milestone plan: a `MilestonePlan { weddingId, type, percent, dueDate }` table. Today it is `SystemSetting` key `payment.milestones.<weddingId>` (JSON `[{type, percent}]`); the Business Settings template is `payment.milestones`.
5. Refund approval consumption: a one-use link between an approved client-refund `Approval` and the reversal `ClientPayment` (`ClientPayment.approvalId`). Today "used" is read from the `ClientPayment.refund` audit row (`meta.approvalId`).
6. `VendorPayment.weddingId` / `weddingVendorId` are required, so a vendor bill that is not linked to a wedding cannot go through Vendor Payments (the legacy `POST /vendor-bills/:id/pay` still settles such a bill directly, under the same approval limit). Making both nullable (plus `vendorId`) would remove that limit.
7. Reversal rows (`reversalOfId`) carry a positive amount because of the `amount > 0` CHECK. Every consumer must use `vendorPaid()` / `clientReceived()` from `common/finance.ts` (or filter `reversalOfId IS NULL` and subtract reversals); raw `SUM(amount)` over `ClientPayment` / `VendorPayment` double counts a refund or reversal. Modules outside WP3 that still use a raw sum: `weddings.service.ts` (finance block), `clients.service.ts`, `portal-client.service.ts`, `vendors.service.ts`, `portal-vendor.service.ts`.
