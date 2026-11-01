# GAP ANALYSIS: MASTER SPEC vs commit 7b2898b

Read-only analysis, 2026-11-01. Evidence is by file path. Legend: IMPL = implemented, PART = partial, MISS = missing.
The spec lists 33 sidebar modules including Dashboard. The "32 modules" below are those 33 minus Dashboard, which is shown as M0.

## 1. Hard decisions (1-14)

| # | Decision | Status | Evidence and concrete delta |
|---|---|---|---|
| 1 | Roles FOUNDER..SYSADMIN, no ADMIN | MISS | `backend/prisma/schema.prisma:10` `enum Role { ADMIN ...}`. ADMIN is used in 134 lines, see section 2. Keycloak realm already has `FOUNDER` (`docker/keycloak/royalknot-realm.json:29`), and `keycloak.service.ts:13` already maps `FOUNDER` and `FOUNDER_ADMIN` to `Role.ADMIN`. |
| 2 | Agreement signed before vendor shortlist or floor plans reach the client | MISS | `portal-client.service.ts:57-122` `vendors()` returns all `weddingVendor` rows with no agreement check. `CLIENT_DOC_CATEGORIES` (line 19) includes `FLOOR_PLAN`, ungated. The only gate is on agreement PDFs (SENT or SIGNED). See 3(d). |
| 3 | Draft workspace vs confirmed wedding, with separate booking, execution and financial fields | MISS | `Wedding.status` (WeddingStatus PLANNING, VENDOR_BOOKING, EVENT_DAY, COMPLETED, CANCELLED) mixes booking and execution. There is no DRAFT, no booking status and no financial status. `Enquiry.convert()` (`enquiries.service.ts:79`) creates a full wedding at once. Stats and revenue only exclude CANCELLED (`analytics.service.ts:21,76,121`). See 3(e). |
| 4 | Vendor sequence and auto-close of competing RFQs | PART | Quotation select closes siblings transactionally (`quotations.service.ts`; e2e `workflows.e2e-spec.ts` "selects the winner transactionally"). Missing: the agreement-signed precondition for RFQs, the "final proposal, client acceptance, deposit" chain, and decision history beyond ActivityLog. The client does not choose a vendor in the portal: selection is planner-side. |
| 5 | Auto-planning only after confirmed plus verified deposit; Full >= 26, Partial reduced | PART | `payments.service.ts:86` generates tasks when the BOOKING milestone is recorded. No "verified" step, no agreement or proposal check. `tasks.service.ts:22` is idempotent (unique `weddingId,templateKey`, `skipDuplicates`). Templates: Full 33, Day-of 27 (`default-templates.ts`). Partial and Day-of are not modelled as subtype/scoped sets: `PackageType` is only FULL_SERVICE and PARTIAL, and the template switch is by name. |
| 6 | Configurable payment milestones | PART | `common/milestones.ts` and `PaymentMilestone` are per wedding and amounts are editable. The type enum is fixed to BOOKING, ADVANCE, FINAL and `@@unique([weddingId,type])`. There is no per-contract or business-settings config UI, and 20/40/40 is hardcoded as the default. |
| 7 | Financial separation, Vendor Payments as its own module | PART | Separate tables exist: ClientInvoice, ClientPayment, VendorBill, VendorPayment, Expense, AdditionalCharge, Reconciliation. But VendorPayment has no workflow, no status, and is created inside `payments.service.ts recordVendor` and `vendor-bills.service.ts pay`. See 3(f). |
| 8 | One canonical module and legacy redirects | PART | Legacy pages still exist as real routes: `/todays-events`, `/vendor-checkin`, `/checklists`, `/updates`, `/quotations`. There is no `redirects()` in `frontend/next.config.mjs` and no `/activity` route. Nav still lists them (`lib/nav.ts`). |
| 9 | Canonical state lists | PART | Mostly different. See 3(c). |
| 10 | Approvals and maker-checker | PART | See 3(g). |
| 11 | Financial integrity | PART | Decimal(14,2), idempotency keys, row locks and audit are good. Gaps: no reversal entries, no immutability, partial reconciliation checks. See 3(h). |
| 12 | 15 security tests | PART | 6 of 15 covered, 6 partial, 3 missing. See 3(i). |
| 13 | Demo data 25 weddings, ~18 vendors each, 3 competing caterer quotes, labelled DEMO | PART | See 3(j). |
| 14 | Required docs | PART | See 3(k). |

## 2. (a) ADMIN to FOUNDER rename: blast radius and migration plan

Counts are from `grep -w ADMIN`, excluding node_modules, `.next`, `deploy/.build` and SYSADMIN. Nothing else in the repo, apart from the files below, depends on the string.

Schema and DB
- `backend/prisma/schema.prisma:11` enum value.
- `backend/prisma/migrations/20261031070533_init/migration.sql` creates `Role` with ADMIN (history; do not edit). User.role stores it. `RolePermission.role` (schema line 1545) is DB-backed and is seeded from `PERMISSION_MATRIX`, so existing rows carry the ADMIN role. Check whether its column is the `Role` enum or a string: if it is the enum the `RENAME VALUE` covers it, if a string it needs `UPDATE "RolePermission" SET role='FOUNDER' WHERE role='ADMIN'`.
- Also check JSON or arrays holding roles: `Document.allowedRoles` (a `Role[]` enum array, covered by RENAME VALUE), the `Notification` role targets, and `Announcement` audience (`announcements.service.ts`, 1 hit).

Backend source (about 14 files, 45 hits)
- `common/guards.ts:39` (RolesGuard bypass `Role.ADMIN`), `common/permissions.ts:3,16,46,51` (`G.APPROVERS`, `PERMISSION_MATRIX.ADMIN`), `common/scope.service.ts:12` (comment).
- `jobs/jobs.module.ts:100,111`, `audit/audit.controller.ts:21`, `notifications/notifications.service.ts:12,15`, `documents/documents.service.ts:31,38`.
- `weddings/weddings.service.ts:27,73`, `approvals/approvals.service.ts:106`, `vendor-bills/vendor-bills.service.ts:135`, `clients/clients.service.ts`, `feedback/feedback.service.ts` (2), `announcements/announcements.service.ts`.
- `messaging/messaging.service.ts` (4), `messaging/access.ts` (3), `users/users.controller.ts:21-23`.
- `admin/roles/roles.controller.ts` (5), `admin/roles/permissions.service.ts` (4), `admin/users/admin-users.controller.ts` (4), `admin/team/team.controller.ts` (4), `admin/shared/permission.guard.ts`, `admin/admin.module.ts`.
- `auth/keycloak.service.ts:13` plus `keycloak.service.spec.ts` (9 hits, expectations of ADMIN).
- `prisma/seed.ts:94,137` (`role: 'ADMIN'`, Arjun Rao and Aarav Royal).

Backend tests
- `backend/test/workflows.e2e-spec.ts` (1), `messaging/access.spec.ts` (2), `admin/admin.spec.ts` (2), `keycloak.service.spec.ts` (9). The e2e agent key `founder` logs in as a seeded user, so it depends on the seed rename only.

Frontend (about 12 files, 55 hits)
- `lib/nav.ts` (38 hits, every item's `roles`), `lib/permissions.ts` (5: `G.APPROVERS`, `HOME`, `PERMISSION_MATRIX.ADMIN`), `lib/auth.tsx` (2: `can()` bypass), `lib/enums.ts`, `types/index.ts` (the Role union).
- `components/layout/app-shell.tsx`, `components/finance/approvals-centre.tsx`.
- Pages `(dashboard)/communications` (4), `team` (2), `settings`, `admin/users`.
- `frontend/e2e/wedflow-sweep.spec.ts` (4).

Keycloak and deploy
- `docker/keycloak/royalknot-realm.json`: realm role `FOUNDER` already exists, user mappings need no change. Realm roles `WEDDING_PLANNER`, `FINANCE_MANAGER`, `OPS_STAFF` and `SYSTEM_ADMIN` are mapped in code. There is no change to the realm JSON, only the mapping target.
- `deploy/platform/docker-compose.yml:80` inline realm uses `founder_admin` described as "app role ADMIN". Update the description text. Roles are matched case-insensitively, so `founder_admin` maps through `FOUNDER_ADMIN`; keep it as an alias.
- Only one realm JSON file exists (`find -name "*realm*"`), so there is nothing under `deploy/` to change apart from the compose text.

Docs
- `docs/ROUTES.md` (40 hits), `docs/WEDFLOW_SPEC.md`, `PROJECT_STATUS.md`, `DEPLOYMENT.md:107` (mentions `founder_admin`), `backend/README.md`, `backend/docs/ER.md` (and it also lists a stale 5-role enum).

Safe migration plan
1. One migration, `ALTER TYPE "Role" RENAME VALUE 'ADMIN' TO 'FOUNDER';`. Prisma has no native rename support: write the migration SQL by hand, then set the schema enum and run `prisma migrate diff` to confirm there is no drift. `RENAME VALUE` is metadata-only and transactional on PG >= 10, rewrites no rows, and updates every enum-typed column (`User.role`, `Document.allowedRoles`, and so on) atomically.
2. Add a data fix in the same migration for any String columns holding "ADMIN". Candidates: `RolePermission.role` if it is a string, `SystemSetting` JSON keys, `Announcement.audience`, `Notification` JSON. Run the check `SELECT ... WHERE ... = 'ADMIN'` per column first.
3. Do the code rename mechanically (`Role.ADMIN` to `Role.FOUNDER`, `'ADMIN'` to `'FOUNDER'`, with `\bADMIN\b` and SYSADMIN excluded) in the same commit as the migration. Deploy backend and frontend together, because the frontend `Role` union and the session role string must match.
4. Roll-forward only. The rollback is the inverse `RENAME VALUE`. Existing JWT or session cookies carry the role inside the token: force a re-login (or accept that a stale token with `ADMIN` fails every guard). Refresh tokens are re-read from the DB user, so rotation heals.
5. Keep the keycloak mapping aliases (`FOUNDER`, `FOUNDER_ADMIN`, `ADMIN`) to `FOUNDER`.
6. Add a unit test that `Object.values(Role)` equals the exact 8 spec codes.

## 3. Per-topic gaps

### (b) Sidebars per role vs `frontend/lib/nav.ts`
Nav is a flat list of items with role arrays. There are no parent groups. The spec requires parent groups, and `navFor()` and the sidebar component must support `group`. All items below are relative to the spec.

- FOUNDER: all 8 groups are missing. Founder lacks `/vendor-payments`, `/activity`, `/approvals` (spec puts approvals under Finance via Expenses & Reconciliation), `/payments` is labelled "Payments" (spec: Client Payments). Founder still gets legacy `/todays-events`, `/vendor-checkin`, `/checklists`, `/updates`, `/quotations`. Settings should be "Business Settings".
- PLANNER: has `/payments` and `/approvals` (spec: Payment Status and My Approval Requests, i.e. role-aware views of `/payments`, `/invoices` and `/approvals`). Lacks `/invoices` (Client Invoice Status, read-only) and `/activity`. It also has `/expenses` (spec: Expense Requests).
- FINANCE: spec says Clients, Weddings, Vendors and Procurement are read-only refs. Nav lacks the `/vendor-payments` route and the `/activity` route. FINANCE has no `/dashboard` problem. It keeps `/reports` (limited) but the spec requires a limited view.
- EVENT_MANAGER: lacks `/vendor-checkin` under the command centre, "Vendor Arrival Status", "Check-in" (guest), "Assigned Vendors / Vendor Directory". Today's Events and Vendor Check-in must become command-centre tabs.
- OPERATIONS: spec has no Command Centre, Incidents or Event Functions as main items. They are "Assigned Event Functions", "Assigned Run Sheet", "Incident/Blocker Reports", "Daily Updates & Work Logs" (the latter now at `/updates`). Operations currently sees `/vendors`, `/guests`, `/accommodation` with broader wording. Needs the `/activity` route plus a work-log view. Remove `/updates`, `/announcements`, `/feedback` (not in spec for OPS; today OPS only sees updates).
- CLIENT: has extra items not in the spec (`/client-portal/checklists`, `/client-portal/planner` is fine). Lacks "My Decisions & To-dos", "Event Schedule" ok. Vendors & Services must be gated by signing (decision 2).
- VENDOR: has extra `/vendor-portal/tasks`, which spec merges into "Deliverables & Tasks". `/vendor-portal/support` and `messages` ok. "Agreements & Contracts" and "Invoices & Payments" ok.
- SYSADMIN: spec sub-items for Integrations (Keycloak, SMTP, Payment Gateway, Maps), Storage (MinIO Config, Bucket Mgmt, Monitoring), System Health (API, DB, Redis, Queue) and Security (Audit Logs, Security Events) are partly tabs of `/admin/integrations`, `/admin/storage`, `/admin/monitoring`, `/admin/audit` (IMPL as 16 pages). The spec's "no second generic Settings module" is violated: nav has `/settings` for SYSADMIN. Remove it (the profile page lives at Account).

New routes and redirects needed (add `redirects()` in `frontend/next.config.mjs`, or a Next middleware):
- New pages: `/activity`, `/vendor-payments`.
- Redirects: `/todays-events` to `/command-centre?view=today`; `/vendor-checkin` to `/command-centre/vendor-checkin`; `/checklists` to `/tasks?view=checklists`; `/updates` to `/activity`; `/quotations` to `/procurement?tab=rfqs`.
- The consumers `/command-centre/vendor-checkin` (new nested route), `/command-centre?view=` and `/tasks?view=checklists` need support in the page code.
- Rename the label "Payments" to "Client Payments". Rename Settings to "Business Settings" and make it Founder only. Today `/settings` is open to all 5 staff roles plus SYSADMIN and CLIENT, which is a permission matrix view.
- `docs/ROUTES.md` must be regenerated.

### (c) Status and enum deltas

| Entity | Prisma enum now | Spec | Change needed | Code that reads it |
|---|---|---|---|---|
| Lead | `EnquiryStage` NEW, CONTACTED, CONSULTATION_SCHEDULED, PROPOSAL_SENT, NEGOTIATION, CONFIRMED, LOST | NEW, INITIAL_CONSULTATION, PROPOSAL_SENT, NEGOTIATION, CONVERTED, LOST | Drop CONTACTED. Rename CONSULTATION_SCHEDULED to INITIAL_CONSULTATION and CONFIRMED to CONVERTED (RENAME VALUE). Data-fix CONTACTED rows to NEW. | `enquiries.service.ts`/`.dto.ts`, `analytics.service.ts`, `jobs/jobs.module.ts`, `seed.ts`, `workflows.e2e-spec.ts`, `frontend/app/(dashboard)/enquiries/page.tsx`, `components/ui/primitives.tsx`, `components/layout/app-shell.tsx`, `lib/enums.ts` |
| Agreement | `AgreementStatus` DRAFT, SENT, SIGNED, VOID | DRAFT, SENT, SIGNED, REJECTED, EXPIRED | Replace VOID with REJECTED and EXPIRED (superseded versions would need a flag or EXPIRED). Add expiry date and a reject action. | `agreements.service.ts` (lines 51, 58, 71 write and read VOID), `portal-client.service.ts:176-190`, `frontend/components/weddings/agreements.tsx`, `primitives.tsx`, `workflows.e2e-spec.ts` |
| Quotation | `RequestStatus` REQUESTED, RECEIVED, ACCEPTED, NOT_SELECTED; `QuotationStatus` SUBMITTED, ACCEPTED, REJECTED | DRAFT, SENT, RECEIVED, UNDER_REVIEW, COMPARED, SELECTED, REJECTED, CLOSED, EXPIRED | Merge into one status enum, with SENT or RECEIVED set on the request side and SELECTED, REJECTED, CLOSED on the loser side. Add `validUntil` for EXPIRED. | `quotations.service.ts/.dto.ts`, `procurement.service.ts`, `portal-vendor.service.ts/.dto.ts`, `budgets.service.ts`, `vendor-invoices.controller.ts`, `quotations/comparison.tsx`, `vendor-portal/quotations/page.tsx`, `portal.e2e-spec.ts`, `workflows.e2e-spec.ts` |
| Task | `TaskStatus` TO_PLAN, IN_PROGRESS, WAITING_FOR_VENDOR, UNDER_REVIEW, COMPLETED, BLOCKED | TO_PLAN, IN_PROGRESS, DONE, BLOCKED (+ derived overdue) | Remove WAITING_FOR_VENDOR and UNDER_REVIEW (map to IN_PROGRESS or BLOCKED), rename COMPLETED to DONE. | `tasks.dto.ts/.service.ts`, `analytics.service.ts` (lines 124-140), `users.service.ts`, `admin/team/team.controller.ts`, `portal-vendor.*`, `payments.service.ts` (indirect), `seed.ts` (UNDER_REVIEW at line 281), `dashboard/page.tsx`, `vendor-portal/tasks/page.tsx`, `lib/enums.ts`, Kanban in `tasks/page.tsx` and the e2e flows |
| Client payment | none: `ClientPayment` has no status | PENDING, PROCESSING, SUCCEEDED, FAILED, REFUNDED | New `PaymentStatus` enum and `status`, `gatewayRef`, `refundOfId` columns. Today rows are inserted as already paid and there is no gateway callback. `docker/hyperswitch` exists but is unwired. | `payments.service.ts`, `invoices.service.ts`, `portal-client`, `payments-panel.tsx` |
| Milestone | `MilestoneStatus` UPCOMING, DUE, PARTIALLY_PAID, PAID, OVERDUE | not in the spec list | Keep, but it is a financial status that should feed the wedding's financial status. | `payments.service.ts`, `common/milestones.ts` |
| Invoice | `ClientInvoiceStatus` DRAFT, SENT, PARTIALLY_PAID, PAID, OVERDUE, VOID | DRAFT, SENT, PARTIALLY_PAID, PAID, OVERDUE(derived), CANCELLED | Rename VOID to CANCELLED. Stop persisting OVERDUE (derive it). | `invoices/invoice-math.ts`, `invoices.service.ts`, `budgets/financial-reports.service.ts`, `invoices-panel.tsx`, `invoice-math.spec.ts`, `workflows.e2e-spec.ts` |
| Vendor bill | `VendorBillStatus` SUBMITTED, VERIFIED, APPROVED, PAID, OVERDUE, REJECTED | DRAFT, SUBMITTED, VERIFIED, APPROVED, PARTIALLY_PAID, PAID, REJECTED | Add DRAFT and PARTIALLY_PAID, drop persisted OVERDUE. Today partial payment leaves the status APPROVED with `amountPaid`. | `vendor-bills.service.ts`, `common/vendor-bill.ts`, `bill-math.ts/.spec.ts`, `vendor-invoices.controller.ts`, `vendor-bills-panel.tsx`, `vendor-invoices-panel.tsx` |
| Vendor payment | none: `VendorPayment` has `kind` ADVANCE or FINAL only | REQUESTED, APPROVED, SCHEDULED, PROCESSING, PAID, FAILED, CANCELLED | New `VendorPaymentStatus` enum plus `billId`, `requestedBy`, `approvalId`, `scheduledFor`. Existing rows backfill to PAID. | `payments.service.ts:recordVendor`, `vendor-bills.service.ts:pay`, `reconciliation.service.ts`, `analytics.service.ts` (`vendorPaid`), `seed.ts` (lines 287, 435-454) |
| RSVP | `RSVP` PENDING, YES, NO, MAYBE | PENDING, CONFIRMED, DECLINED | YES to CONFIRMED, NO to DECLINED, MAYBE to PENDING (data-fix). | `guests.service.ts/.dto.ts`, `events.service.ts` (confirmed attendance), `accommodation.service.ts`, `portal-client.service.ts`, `weddings.service.ts`, `default-templates.ts`, `seed.ts`, `lib/csv.ts`, `guests-panel.tsx`, `client-portal/guests`, `workflows.e2e-spec.ts` and `portal.e2e-spec.ts` |
| Vendor arrival | `ArrivalStatus` NOT_ARRIVED, ARRIVED, DELAYED, COMPLETED | EXPECTED, ON_THE_WAY, ARRIVED, DELAYED, COMPLETED | Rename NOT_ARRIVED to EXPECTED, add ON_THE_WAY. | `events.service.ts`, `event-ops.service.ts/.spec.ts`, `vendors.service.ts`, `analytics.service.ts:100`, `command-centre/panels.tsx`, `ops/vendor-checkin.tsx`, `vendor-portal/check-in` |
| Room allocation | `RoomAllocationStatus` RESERVED, CHECKED_IN, CHECKED_OUT, CANCELLED | PENDING, CONFIRMED, CHECKED_IN, CHECKED_OUT, CANCELLED | RESERVED to CONFIRMED and add PENDING. | `accommodation.service.ts`, `ops/accommodation-panel.tsx` |
| Incident | `IncidentStatus` OPEN, IN_PROGRESS, RESOLVED | REPORTED, TRIAGED, ASSIGNED, IN_PROGRESS, RESOLVED, CLOSED | OPEN to REPORTED, add TRIAGED, ASSIGNED, CLOSED. Backend transition table is missing. | `events.service.ts`/`event-ops.service.ts` and DTOs, `budgets/financial-reports.service.ts`, `feedback.service.ts`, `approvals.service.ts` (string 'OPEN' unrelated), `incidents-board.tsx`, `command-centre/panels.tsx` |
| Wedding booking | none (`WeddingStatus` covers part) | DRAFT, AGREEMENT_PENDING, PROPOSAL_PENDING, DEPOSIT_PENDING, CONFIRMED, CANCELLED | New `bookingStatus` enum and column. Backfill existing 25 weddings to CONFIRMED or CANCELLED. | all `WeddingStatus` consumers below |
| Wedding execution stage | `WeddingStatus` PLANNING, VENDOR_BOOKING, EVENT_DAY, COMPLETED, CANCELLED | INITIAL_PHASE, VENDOR_BOOKING, PLANNING, EVENT_DAY, FINANCIAL_CLOSEOUT, COMPLETED | New `executionStage` enum. Map PLANNING to PLANNING, and keep VENDOR_BOOKING, EVENT_DAY and COMPLETED. CANCELLED moves to booking status. | `weddings.dto/.controller/.service.ts`, `quotations.service.ts`, `payments.service.ts:88`, `events.dto/.service.ts`, `analytics.service.ts` (lines 87, 120-129), `seed.ts`, `portal.e2e-spec.ts`, `incidents-board.tsx`, `lib/wedding-context.tsx`, `lib/enums.ts` |
| Wedding financial status | none | spec asks for a separate field | New `financialStatus` (derived from invoices, milestones, bills and reconciliation, or a stored field). | new |

Migration shape: Postgres enum values cannot be dropped. Use RENAME VALUE for pure renames and the create-new-type, `ALTER COLUMN ... USING CASE`, drop-old-type route for merges (Task, Quotation, RSVP, Lead).

### (d) Agreement before vendor disclosure (client portal)
Not enforced. `portal-client.service.ts:116 vendors()`, the `/client-portal/vendors` page, and the documents list (`FLOOR_PLAN` category, line 19) are not conditioned on a signed agreement. `AgreementSignature` is created by the staff-side `sign()` (`agreements.service.ts:61`). Client signing is possible in the staff app only.
Delta: (1) server-side gate in `PortalClientService.vendors()` and `documents()`, returning `{ locked: true, reason: 'AGREEMENT_UNSIGNED' }` or 403 until an agreement with status SIGNED exists. Do the same for the floor plan documents and for `/portal/client/*` document download. (2) A client portal "sign agreement" endpoint. (3) The locked UI state in `client-portal/vendors`. (4) Tests: couple with SENT agreement sees no vendors, then sees them after signing. The RFQ module also needs the same gate for "vendor shortlist" (staff side: RFQs only after signing).

### (e) Draft vs confirmed wedding
- Today: `Enquiry.convert()` creates the Wedding in PLANNING (status default) with milestones in one transaction (`weddings.service.ts createTx`). There is no draft workspace and no confirmation step.
- "Confirmation" is implicit: recording the BOOKING milestone payment (`payments.service.ts:86-88`) triggers task generation and moves PLANNING to VENDOR_BOOKING. It does not require: agreement SIGNED (not checked), proposal accepted (`Proposal` model exists, `ProposalStatus` ACCEPTED, but is not checked), or a verified deposit (a payment is recorded as final, and there is no verification step). The code swallows task generation errors (`.catch(() => null)`).
- Revenue and stats: `analytics.service.ts` filters only `status: { not: 'CANCELLED' }` (lines 21, 76, 121), and counts PLANNING as "active". Since every wedding is created non-draft, drafts do not exist and nothing can be excluded. All `contractValue` is counted as revenue even if unconfirmed.
- Delta: `bookingStatus` field (3(c)), `WeddingsService.confirm(id)` (a transactional guard: SIGNED agreement and ACCEPTED proposal and a VERIFIED deposit, idempotent on repeat so no duplicate project, tasks or milestones), a deposit-verified flag on `ClientPayment` or `PaymentStatus.SUCCEEDED`, move task generation out of `payments.record` into `confirm`, and add `bookingStatus = CONFIRMED` filters to every analytics, profitability and cash-flow query (`analytics.service.ts`, `budgets.service.ts`, `financial-reports.service.ts`, `reports`). `Enquiry.convert` should create a DRAFT workspace. The Weddings page needs the derived tabs (All, In Planning, In Progress, Completed, Cancelled) plus Drafts.

### (f) Vendor Payments as a separate module
Exists today inside other modules:
- `VendorPayment` model (`schema.prisma:733`): fields kind (ADVANCE or FINAL), amount, method, reference, paidAt, idempotencyKey, recordedById. No status, no approver, no link to a bill.
- `POST /weddings/:id/vendor-payments` (`payments.controller.ts:17`, FINANCE) calls `PaymentsService.recordVendor`: row-locks WeddingVendor, caps by bill, idempotent.
- `VendorBillsService.pay()` also creates VendorPayments for linked weddings, and keeps bill idempotency in ActivityLog metadata (not a table; see `docs/SCHEMA_REQUESTS.md`).
- `ReconciliationService.settle()` creates settlements, and `VendorSettlement` is a separate status concept.
- The vendor portal reads payments in `vendor-invoices.controller.ts:52` (`/portal/vendor/invoices/payments`).
- Frontend: only inside `vendor-bills-panel.tsx` and `payments-panel.tsx`. No `/vendor-payments` page.
Delta: new `vendor-payments` module and route (backend controller, service, DTO), the REQUESTED to PAID workflow with maker-checker (the Finance requester cannot approve; the Founder approves above a threshold; SYSADMIN excluded), the `VendorPaymentStatus` enum, a bill link and a scheduled and failed handling path, and the views (dashboard, requests, advances, scheduled, settlements, approvals, execution, history, failed). Refactor `recordVendor` and `pay()` into it. `PERMISSION_MATRIX` needs a `vendor-payments` module.

### (g) Maker-checker and the Approval model
Spec fields vs `Approval` (`schema.prisma:1043`):
- Present: type, status (PENDING, IN_REVIEW, APPROVED, REJECTED, CANCELLED), title, description, amount, weddingId, entity and entityId (source module and record), requestedBy (initiator), decidedBy (approver), decisionNote (notes), decidedAt, createdAt.
- Missing: human-readable `reference` (for example APR-2026-0001), `reason` (only description), a supporting document link (`documentId`), an assigned `approverId` (only the decider is stored), and `sourceModule` as a separate field (the entity is a free string). The `ApprovalType` enum has no BUDGET_INCREASE (the workaround is in `SCHEMA_REQUESTS.md`).
Enforcement:
- `POST /approvals/:id/approve|reject` is limited to `G.APPROVERS` = [ADMIN], so only the Founder decides (`approvals.controller.ts`). The service does NOT check `requestedById !== actor.id`, so the Founder can self-approve (legal under spec only for founder exceptions, but an explicit rule is missing). `RolesGuard` lets ADMIN through everything.
- Finance can approve expenses with `POST /expenses/:id/decision` (`@Roles(Role.FINANCE)`) with no check that the creator is a different person (`expenses.service.ts:51`). The Finance user who logs an expense can approve it. The Planner's own expense is fine since Planner cannot decide. No maker-checker.
- Vendor bills: the same Finance user can submit (`create`), verify, approve (`vendor-bills.service.ts`) and pay. There is no separation between verifier, approver and payer. Over-limit bills (`billApprovalLimit`) route to the Approval centre and only Founder bypasses.
- Client discount: invoices hold until Founder approval (e2e: "holds a discounted invoice until the Founder approves", `finance.e2e-spec.ts:84`).
- "Event coordinator reports extra costs only": EVENT_MANAGER has no `expenses` permission, and `Expense create` is `G.ALL` (includes EVENT_MANAGER and OPERATIONS) and `payments`-free. Check intent: they can log expenses, which approximates "reports extra costs". Fine, but `approvals:write` is granted to PLANNER and FINANCE in the matrix and EVENT_MANAGER can create approval requests (`G.APPROVAL_REQUEST`).
- SYSADMIN never approves: IMPL (`SYSADMIN` has no approvals, payments or expenses in matrix, and locked-role default-deny).
Delta: self-approval guard in `ApprovalsService.decide`, `ExpensesService.decide`, `VendorBillsService.verify/approve/pay`; add the missing fields; link `VendorPayment` to `Approval`; tests for each.

### (h) Audit immutability and no-delete of posted financial records
- Audit: `AuditService.log` writes `ActivityLog` rows (`audit.service.ts`). Audit is called inside transactions for payments, invoices, bills and approvals. IMPL for coverage, MISS for immutability: there is no DB trigger or REVOKE UPDATE/DELETE, and `ActivityLog` FKs use `onDelete: SetNull` for actor and wedding (so deleting a user or a wedding rewrites audit rows). Wedding deletion cascades to payments (`onDelete: Cascade` on ClientPayment, VendorPayment, PaymentMilestone) and to milestones, which allows losing posted money by deleting a wedding. `AuditController` is GET only. There is no hash chain or append-only guarantee. Security events and auth events are not logged separately, and document access is not logged.
- Deletes: no `DELETE` on payments, invoices, bills or VendorPayment (IMPL). But `DELETE reconciliation/charges/:id` (`reconciliation.controller.ts:16`) removes an `AdditionalCharge`, a financial record, without a reversal. `Expense` has no delete. `ClientInvoice` has VOID (to become CANCELLED) but there are no refunds, credit notes or reversal entries anywhere. `ClientPayment` and `VendorPayment` have no `reversalOf` field.
- Delta: reversal and correction entries (`reversalOfId` on ClientPayment, VendorPayment and Expense), `PaymentStatus.REFUNDED`, block deletion of posted records (and Wedding delete when financial records exist), change FKs from Cascade to Restrict on posted-financial relations, a Postgres trigger rejecting UPDATE and DELETE on `ActivityLog` (a migration), change audit FKs to Restrict or denormalise the actor, and tests.
- Reconciliation checks (spec 11): reconciliation covers vendor settlement and extra guest charges (`reconciliation.service.ts`). Duplicate bill refs: the `(vendorId, billNo)` unique constraint exists (ConflictException at `vendor-bills.service.ts`). PO and quotation matching exists in the Vendor Bills panel (PO line match, `bill-math.ts`). Missing: unapproved extras flag in a unified queue, qty and rate diffs, overpayment flags (overpayment is prevented at write time instead).

### (i) The 15 security test cases

| # | Case | Status | Existing test (file, case) or gap |
|---|---|---|---|
| 1 | Couple A cannot see couple B | COVERED | `backend/test/portal.e2e-spec.ts` "client portal isolation": "each couple sees only its own wedding", "rejects an explicit foreign weddingId", "guest list never leaks...", "documents, receipts and UPI QR are tenant scoped" |
| 2 | Vendor A vs B quotation | COVERED | `portal.e2e-spec.ts` "vendor portal isolation": "another vendor's RFQ is a 404 for detail, quotation and PDF", "each vendor sees only its own RFQs / bookings" |
| 3 | Event coordinator cannot approve vendor payments | PARTIAL | `finance.e2e-spec.ts` "keeps vendor bills away from planners and vendors" (neha, a planner) and "enforces roles"; `workflows.e2e-spec.ts` "enforces role permissions" (vikram, an event manager, gets 403 on wedding payments). No case POSTs `/approvals/:id/approve`, `/vendor-bills/:id/approve` or the future vendor-payments approve as EVENT_MANAGER. |
| 4 | Team member (unassigned) cannot see records | MISS | Nothing tests that OPERATIONS or EVENT_MANAGER only see assigned weddings and tasks. In fact `ScopeService.weddingWhere` leaves staff unchanged (`scope.service.ts:12`: "everyone else unchanged"), so the app has no assignment scoping for staff: a feature gap, not just a test gap. |
| 5 | Planner cannot approve own request | PARTIAL | `finance.e2e-spec.ts:84`: planner `meera` gets 403 on approve (role-based, because only the Founder approves). No own-request test, and the service has no self check. |
| 6 | Finance maker-checker | MISS | Not tested and not implemented (3(g)). |
| 7 | Vendor cannot see other wedding invoices | PARTIAL | `portal.e2e-spec.ts` "deliverables, tasks and reviews cannot be touched across vendors" and "documents: vendor sees only role-granted docs of its own weddings". There is no case for `/portal/vendor/invoices/:id` or `:id/file` of another vendor (the controller is written to scope by vendor, but untested). |
| 8 | Sysadmin cannot execute payments | PARTIAL | `portal.e2e-spec.ts` "keeps each portal to its own role"-style gates cover CLIENT and VENDOR. There is no SYSADMIN case posting a payment, bill pay or approval (unit expectations are in `admin/admin.spec.ts` for matrix content only). |
| 9 | API bypass of frontend | COVERED (in part) | `workflows.e2e-spec.ts` "enforces role permissions", "protects routes without a session", "blocks cross-origin state-changing requests (CSRF origin check)", `finance.e2e-spec.ts` "enforces roles". All of these call the API directly. |
| 10 | IDOR | COVERED | `portal.e2e-spec.ts` foreign `weddingId`, foreign guest change/delete/invite, 404 on foreign RFQ and on foreign document |
| 11 | Unauthorized MinIO download fails | COVERED | `workflows.e2e-spec.ts` "rejects disallowed types and unauthenticated downloads" (401) and "enforces per-document role access" (403). Downloads are proxied by the API, and the bucket is not public. A direct MinIO URL or presigned-URL test is missing. |
| 12 | Socket room auth | PARTIAL | `workflows.e2e-spec.ts` "rejects unauthenticated sockets" only. `live.gateway.ts:41 join` lets any authenticated socket join any `wedding:<id>` room (a CLIENT or VENDOR of another wedding can listen). This is a real bug, not only a missing test. |
| 13 | Repeated gateway callbacks, no duplicate payments | PARTIAL | Idempotency is covered: `workflows.e2e-spec.ts` "is idempotent: the same key returns the original payment", "duplicate concurrent submits with the SAME key create exactly one payment", `finance.e2e-spec.ts` "serialises concurrent identical submissions". There is no gateway callback endpoint yet. A webhook test is needed once the Hyperswitch webhook exists. |
| 14 | Repeated booking confirmation, no duplicate project | MISS | No confirm endpoint. The nearest: "is idempotent..." (payment) and "never generates duplicate tasks when the trigger runs again". |
| 15 | Repeated task generation, no duplicates | COVERED | `workflows.e2e-spec.ts` "never generates duplicate tasks when the trigger runs again" |

Summary: 6 COVERED (1, 2, 9, 10, 11, 15), 6 PARTIAL (3, 5, 7, 8, 12, 13), 3 MISSING (4, 6, 14). Cases 4, 6 and 14 need product code first (assignment scoping, maker-checker, confirm endpoint), and case 12 is a real bug (any authenticated socket can join any wedding room).

### (j) Demo data vs spec
- 25 weddings: IMPL (`seed.ts` array of 25 configs, `PROJECT_STATUS.md` line 77). All are non-draft, and there are no DRAFT or pending-confirmation weddings.
- Guests 400-500: PART. Mehta has 400 expected, and the seed creates 290 plus a CSV import for it. Other weddings use `guests` from 180 to 600 (for example 180, 220, 600), and `PROJECT_STATUS` states 450 guests total (not per wedding). Spec wants 400-500 guests per wedding (verify intent).
- About 18 vendors per wedding: PART. Only the Mehta wedding is driven with 18 vendors. The other 24 get fewer (`wvs` in the seed). 26 vendors in the pool.
- 3 competing caterer quotes: IMPL for Mehta only (Royal Caterers selected, not cheapest). Not every wedding.
- DEMO label: MISS. There is no DEMO tag in the seed, in wedding names, in the UI, or in the database (the only DEMO strings are `DEMO_PASSWORD` and `NEXT_PUBLIC_DEMO_MODE` for the role switcher). Spec: labelled DEMO. Add an `isDemo` flag or a `[DEMO]` prefix, plus a banner. `SystemSetting`-based flag can avoid a schema change.
- Roles in seed: 9 users, no FOUNDER named role. Seed users are `@royalknot.in` (Keycloak) and `.local` for founder. Seed role strings need the rename (`seed.ts:94,137`).
- The seed must be updated for the new enums (UNDER_REVIEW, NOT_ARRIVED, OPEN and others) and for draft and confirmed weddings plus approval and vendor payment data.

### (k) Docs
| Doc | Status | Evidence |
|---|---|---|
| Requirements traceability register | MISS (first draft in `docs/TRACEABILITY.md`) | none before this analysis |
| ER diagram | PART | `backend/docs/ER.md` is a prose plan, stale (5 roles, no WedFlow tables) and not a diagram. Needs a Mermaid ER generated from the schema (`prisma-erd-generator` or by hand). |
| Permission matrix | PART | `PERMISSION_MATRIX` in code (`common/permissions.ts`), DB-seeded and visible at `/admin/roles`, but there is no document. |
| Role manuals (8) | MISS | none |
| Architecture doc | PART | scattered in `README.md`, `DEPLOYMENT.md`, `DOKPLOY_DEPLOYMENT.md`, `PROJECT_STATUS.md`. No single diagram. |
| Demo script | MISS | none (`docs/WEDFLOW_SPEC.md` is a screenshot spec). |
| Route table | PART | `docs/ROUTES.md` is stale after the rename and redirects. |

## 4. Modules (32, excluding Dashboard) and sidebars

M0 Dashboard: PART. `/dashboard` exists (analytics). Not for CLIENT, VENDOR or SYSADMIN (they have portal dashboards, IMPL). Counts include drafts and exclude CANCELLED only.

| # | Module | Status | Evidence and delta |
|---|---|---|---|
| 1 | Enquiries | PART | `modules/enquiries`, `/enquiries`, `/enquiries/[id]`. Enum differs (3c). Missing tabs: conversion analytics, follow-ups page (a `followUpDue` filter exists), lost list. Conversion must create a draft. |
| 2 | Clients | PART | `modules/clients`, `/clients`, `/clients/[id]`. Directory and profile exist. Wedding history, communication history and financial summary are to be verified, with no explicit tabs seen. |
| 3 | Weddings | PART | `modules/weddings`, `/weddings`, `/weddings/[id]`. No drafts, no booking status or financial status, and no tabs (3c, 3e). |
| 4 | Proposals and Agreements | PART | `modules/proposals`, `modules/agreements`, `/proposals`. Proposal status is separate from signing status (IMPL). Missing: agreement expiry and reject, client-side signing, signature requests list, templates UI check. |
| 5 | Event Functions | PART | `modules/events` (`event-ops`), `/event-functions`. Backed by `WeddingEvent` with workarounds listed in `docs/SCHEMA_REQUESTS.md` (status, endAt, vendor assignment join table, function budget are missing). |
| 6 | Calendar | PART | `/calendar` exists. Check backend source. No `modules/calendar`; it likely aggregates events and tasks. |
| 7 | Vendors | PART | `modules/vendors`, `/vendors`. Directory, services and reviews exist. Locations, availability (workaround in `SystemSetting`) and evaluation are partial. |
| 8 | Procurement | PART | `modules/procurement` and `modules/quotations`, `/procurement` and `/quotations`. POs exist. The RFQ tab merge, selection review, rejected RFQs and contract refs need the tabbed layout and the redirect. |
| 9 | Planning and Tasks | PART | `modules/tasks`, `modules/checklists`, `/tasks`, `/checklists`. Kanban, templates, dependencies and generation exist. Gantt, evidence and reviews, workload and the `?view=checklists` merge are missing. Status enum differs. |
| 10 | Event Command Centre | PART | `modules/events`, `websocket/live.gateway.ts`, `/command-centre`, `/todays-events`, `/vendor-checkin`. Live updates work. Today and vendor check-in must become subviews, with the schedule-change log missing. Socket room auth bug (3i). |
| 11 | Incidents | PART | `/incidents`, `events/event-ops`. Status machine is short (3c). No escalation. |
| 12 | Guests | PART | `modules/guests`, `/guests`. CSV import, RSVP, check-in and stats exist. Missing: QR generation, family groups beyond `group`, dietary and special requirement fields (verify), function assignment. |
| 13 | Accommodation | IMPL/PART | `modules/accommodation`, `/accommodation`. Hotels, rooms, allocation and check-in exist. Enum differs (PENDING and CONFIRMED). Expenses tab missing. |
| 14 | Transport | IMPL/PART | `modules/transport`, `/transport`. Vehicles, drivers, trips and guest transport exist. Expenses link missing. |
| 15 | Client Invoices | PART | `modules/invoices`, `/invoices`. Rename VOID to CANCELLED, derive OVERDUE. Additional client charges live in `AdditionalCharge` (reconciliation). PDF exists (`pdf.service`). |
| 16 | Client Payments | PART | `modules/payments`, `/payments`. Recording, receipts and UPI QR exist. No status workflow, refunds, gateway (Hyperswitch present only in `docker/`), reminders (job exists). Label to rename. |
| 17 | Vendor Bills | PART | `modules/vendor-bills`, `/vendor-bills`. Verify, approve and pay exist, with PO matching. Missing DRAFT and PARTIALLY_PAID, advance adjustment view, separate discrepancy tab. |
| 18 | Vendor Payments | MISS | No module or route (3f). |
| 19 | Expenses and Reconciliation | PART | `modules/expenses`, `modules/reconciliation`, `/expenses`. No maker-checker, no unified reconciliation queue, charge delete without reversal. |
| 20 | Budgets and Profitability | IMPL/PART | `modules/budgets`, `/budgets`. Planned vs actual, profitability, season overview exist. Must exclude drafts. |
| 21 | Cash Flow | PART | `/cash-flow`, `cash-flow-panel.tsx`, in `budgets` or `analytics` services. Forecast depth to be verified. |
| 22 | Financial Reports | PART | `budgets/financial-reports.service.ts`, `/financial-reports`. AR, AP and others exist. Verify tax summary and wedding statements. |
| 23 | Communications | IMPL | `modules/messaging`, `/communications`, the portals' chat pages. |
| 24 | Announcements | IMPL | `modules/announcements`, `/announcements`. |
| 25 | Feedback and Requests | IMPL | `modules/feedback`, `/feedback` (single reply only; see `SCHEMA_REQUESTS.md`). |
| 26 | Notifications | IMPL | `modules/notifications`, `/notifications` (the per-user preferences are kept in `SystemSetting`). |
| 27 | Activity Feed | MISS | No `/activity`; `/updates` ("Updates and Reports") is the old name. The data source (`ActivityLog`) exists. The FieldReport model is requested in `SCHEMA_REQUESTS.md`. |
| 28 | Reports and Analytics | PART | `modules/analytics`, `/reports`. Overview, profitability, vendors, team exist. Revenue by season, guest analysis, planner and event performance to be verified. |
| 29 | Documents | IMPL | `modules/documents`, `/documents`, MinIO, versions, role access. Document access is not audit-logged. |
| 30 | Team Management | PART | `/team`, `modules/users`, `admin/team`. Directory exists. Workload, calendar and performance are to be verified. |
| 31 | Audit Logs | PART | `modules/audit`, `/audit-logs`, `/admin/audit`. Read only and filtered. Not immutable (3h), and sub-types (auth, document access, vendor selection history) are not separated. |
| 32 | Business Settings | PART | `/settings` is a role and profile page open to every role. There is no founder-only business settings (packages, service catalogue, pricing defaults, payment milestones, approval thresholds as env `EXPENSE_APPROVAL_LIMIT` and `billApprovalLimit()`, templates). Master data lives under `/admin/master-data` (SYSADMIN) and `SystemSetting`. |

Sidebars (8): FOUNDER MISS (no groups, wrong role code, missing items), PLANNER PART, FINANCE PART, EVENT_MANAGER PART, OPERATIONS PART, CLIENT PART (close, minus decision to-dos and the signed gate), VENDOR PART (close), SYSADMIN PART (16 pages exist, extra `/settings`). Every sidebar needs the grouped structure in `lib/nav.ts` and `navFor()`, and the sidebar component to render groups.

## 5. PRIORITISED WORK PLAN (6 work packages, disjoint file ownership)

Rule: only WP1 touches `backend/prisma/schema.prisma`, `backend/prisma/migrations/**`, `backend/prisma/seed.ts` and generates Prisma clients. All later packages read the new schema only after WP1 merges. Backend source ownership is split by module directory so no two agents edit the same file. Shared files (`common/permissions.ts`, `lib/permissions.ts`, `lib/nav.ts`, `lib/enums.ts`, `types/index.ts`) are owned by WP1 (mechanical rename) and then by the package named below.

### WP1 (MUST GO FIRST): schema, enums, role rename, seed, docker/deploy text. Size L
Owns: `backend/prisma/schema.prisma`, `backend/prisma/migrations/**` (new migrations), `backend/prisma/seed.ts` and `run-seed.js`; the global mechanical rename ADMIN to FOUNDER and enum value renames across `backend/src/**` and `frontend/**` (rename-only edits, no behaviour change); `docker/keycloak/royalknot-realm.json`, `deploy/platform/docker-compose.yml`, `backend/src/modules/auth/keycloak.service(.spec).ts`.
Deliverables: migration 1 `RENAME VALUE ADMIN to FOUNDER` plus data fixes; enum migrations for 3(c) (Lead, Agreement, Quotation, Task, RSVP, Invoice, VendorBill, Arrival, RoomAllocation, Incident); new enums and columns: `Wedding.bookingStatus/executionStage/financialStatus`, `ClientPayment.status/verified*/reversalOfId`, `VendorPayment.status/billId/approvalId/scheduledFor/reversalOfId`, `Approval.reference/reason/approverId/documentId/sourceModule`, `Agreement.expiresAt`, `Quotation.validUntil`; `isDemo` flag; audit append-only trigger migration; FK Cascade to Restrict on posted-financial relations. Update the seed (DEMO label, 18 vendors each, 3 caterer quotes, drafts, approvals). Make the code compile again after the renames (rename-only), then freeze schema. Gate: `prisma validate`, `tsc` on both apps, and the existing unit tests green.

### WP2: workflow and business-rule backend (weddings, agreements, quotations, tasks, enquiries, guests, events, portal-client). Size L (after WP1)
Owns: `backend/src/modules/{weddings,agreements,proposals,enquiries,quotations,procurement,tasks,checklists,guests,events,accommodation,transport,vendors,portal-client,portal-vendor}/**`, `backend/src/websocket/**`, `common/milestones.ts`.
Deliverables: draft workspace and `confirm()` guard (agreement SIGNED, proposal ACCEPTED, deposit verified, idempotent), auto-planning only on confirm (move out of `payments.record` through a small hook called by WP3), agreement gate on client vendors, floor plans and RFQs, client signing endpoint, transition tables for all state machines, socket room authorisation (CLIENT or VENDOR only their own wedding), the Full and Partial task sets, stats excluding drafts, staff assignment scoping (ScopeService changes are owned here, `common/scope.service.ts`).

### WP3: finance backend (vendor payments, maker-checker, integrity). Size L (after WP1; parallel with WP2)
Owns: `backend/src/modules/{payments,invoices,vendor-bills,expenses,reconciliation,budgets,approvals,audit,analytics}/**`, new `backend/src/modules/vendor-payments/**`, `backend/src/jobs/**`, `common/finance.ts`, `common/vendor-bill.ts`, `common/pdf*.ts`, `app.module.ts` registration (single owner).
Deliverables: Vendor Payments module and workflow, self-approval guards, Approval model fields, reversal and refund entries, no hard delete (replace charge delete), payment status and a gateway-callback endpoint with idempotency, reconciliation checks, confirmed-only revenue filters in analytics, audit logging for document access and auth events.

### WP4: permissions, nav, routes and frontend shell. Size M (after WP1)
Owns: `backend/src/common/permissions.ts`, `backend/src/common/guards.ts`, `backend/src/modules/admin/**`, `backend/src/modules/users/**`, `frontend/lib/{nav,permissions,auth,config}.ts(x)`, `frontend/components/layout/**`, `frontend/next.config.mjs`, `frontend/middleware.ts`, `docs/ROUTES.md`.
Deliverables: grouped nav for the 8 sidebars, the 5 legacy redirects, `/activity` route shell, relabels, Business Settings (Founder only) and removal of the SYSADMIN `/settings`, permission matrix entries for `vendor-payments` and `activity`, role-aware route guards.

### WP5: frontend feature pages. Size L (after WP1, can start with stubs against WP2 and WP3 contracts)
Owns: `frontend/app/(dashboard)/**` except layout and settings owned by WP4, `frontend/components/**` except `layout/`, `frontend/lib/{enums,csv,api,wedding-context}.ts`, `frontend/types/**`.
Deliverables: new `/vendor-payments` and `/activity` pages, tabbed module pages (Weddings tabs and Drafts, Procurement `?tab=rfqs`, Tasks `?view=checklists`, Command Centre `?view=today` and `/command-centre/vendor-checkin`), client-portal locked vendors and floor plans UI plus signing, new enum labels and badges, DEMO banner, `/client-portal` "My Decisions and To-dos".

### WP6: tests, docs and traceability. Size M (starts in parallel and finishes last)
Owns: `backend/test/**`, `backend/src/**/*.spec.ts` (new spec files only), `frontend/e2e/**`, `docs/**` except `ROUTES.md` and `MASTER_SPEC.md`, `backend/docs/**`, `README.md`, `PROJECT_STATUS.md`, `DEPLOYMENT.md`.
Deliverables: the 15 security cases as a dedicated `backend/test/security.e2e-spec.ts` (cases 3, 4, 5, 6, 7, 8, 12, 14 are new, the rest extended), updated e2e for the renamed enums and the confirm flow, Mermaid ER diagram, permission matrix doc, 8 role manuals, architecture doc, demo script, a completed `docs/TRACEABILITY.md`.

Order: WP1 first and alone (merge and freeze). Then WP2, WP3 and WP4 in parallel, with WP5 starting once WP4 has pushed the route names, and WP6 trailing. If only one agent is available, run WP1, WP3, WP2, WP4, WP5, WP6.
