# Routes (WedFlow)

Frontend route | role(s) | owner module | backend prefix. Status `exists` = already built before the foundation; `stub` = placeholder (`ComingSoon`) to be filled in by the owner module.

Owner module = directory under `backend/src/modules/<owner>` (Nest module already registered in `app.module.ts`). Backend prefixes are relative to `/api/v1`.
Nav entries live in `frontend/lib/nav.ts` (`NAV_BY_ROLE`: one grouped sidebar per role, FOUNDER explicit); pages under `frontend/app/(dashboard)/<route>/page.tsx`.

| route | role(s) | owner module | backend prefix | status |
|---|---|---|---|---|
| `/dashboard` | FOUNDER, PLANNER, EVENT_MANAGER, FINANCE, OPERATIONS | analytics | `/analytics` | exists |
| `/enquiries` | FOUNDER, PLANNER | enquiries | `/enquiries` | exists |
| `/clients` | FOUNDER, PLANNER, FINANCE | clients | `/clients` | done |
| `/weddings` | FOUNDER, PLANNER, EVENT_MANAGER, FINANCE, OPERATIONS | weddings | `/weddings` | exists |
| `/vendors` | FOUNDER, PLANNER, EVENT_MANAGER, FINANCE, OPERATIONS | vendors | `/vendors` | exists |
| `/procurement` | FOUNDER, PLANNER, FINANCE (read-only) | procurement | `/procurement` | done; `?tab=rfqs` (absorbs `/quotations`), `comparison`, `pos` |
| `/proposals` | FOUNDER, PLANNER | proposals | `/proposals` | done |
| `/tasks` | FOUNDER, PLANNER, EVENT_MANAGER, OPERATIONS | tasks | `/tasks` | exists; `?view=my`, `?view=checklists` (absorbs `/checklists`) |
| `/event-functions` | FOUNDER, PLANNER, EVENT_MANAGER, OPERATIONS | events | `/events` | done |
| `/command-centre` | FOUNDER, PLANNER (oversight), EVENT_MANAGER, OPERATIONS (assigned run sheet) | events | `/events` | exists; `?view=` today, run-sheet, arrivals (WP5 fills) |
| `/command-centre/vendor-checkin` | FOUNDER, EVENT_MANAGER | events | `/events/arrivals` | done (mounts `VendorCheckinScreen`; replaces `/vendor-checkin`) |
| `/incidents` | FOUNDER, PLANNER, EVENT_MANAGER, OPERATIONS | events | `/events/incidents` | done |
| `/guests` | FOUNDER, PLANNER, EVENT_MANAGER, OPERATIONS | guests | `/guests` | exists |
| `/accommodation` | FOUNDER, PLANNER, EVENT_MANAGER, OPERATIONS | accommodation | `/accommodation` | done |
| `/transport` | FOUNDER, PLANNER, EVENT_MANAGER, OPERATIONS | transport | `/transport` | done |
| `/calendar` | FOUNDER, PLANNER, EVENT_MANAGER, OPERATIONS | events | `/events/calendar` | done |
| `/communications` | FOUNDER, PLANNER, EVENT_MANAGER, FINANCE, OPERATIONS | messaging | `/messaging` | done |
| `/announcements` | FOUNDER, PLANNER, EVENT_MANAGER | announcements | `/announcements` | done |
| `/feedback` | FOUNDER, PLANNER, EVENT_MANAGER | feedback | `/feedback` | done |
| `/approvals` | FOUNDER, PLANNER, FINANCE | approvals | `/approvals` | done |
| `/payments` | FOUNDER, PLANNER, FINANCE | payments | `/payments` | exists |
| `/invoices` | FOUNDER, FINANCE | invoices | `/invoices` | done |
| `/vendor-bills` | FOUNDER, FINANCE | vendor-bills | `/vendor-bills` | done |
| `/expenses` | FOUNDER, PLANNER, FINANCE | expenses | `/expenses` | exists |
| `/budgets` | FOUNDER, FINANCE | budgets | `/budgets` | done |
| `/cash-flow` | FOUNDER, FINANCE | budgets | `/budgets/cash-flow` | done |
| `/financial-reports` | FOUNDER, FINANCE | analytics | `/analytics/financial` | done |
| `/reports` | FOUNDER, FINANCE | analytics | `/analytics` | exists |
| `/documents` | FOUNDER, PLANNER, EVENT_MANAGER, FINANCE, OPERATIONS | documents | `/documents` | exists |
| `/notifications` | FOUNDER, PLANNER, EVENT_MANAGER, FINANCE, OPERATIONS | notifications | `/notifications` | done |
| `/team` | FOUNDER, PLANNER | users | `/users` | exists |
| `/vendor-payments` | FOUNDER (approve), FINANCE (request/execute) | vendor-payments (WP3) | `/vendor-payments` | placeholder (`ComingSoon`), WP5 builds |
| `/activity` | FOUNDER, PLANNER, EVENT_MANAGER, OPERATIONS (`?tab=work-logs` = Daily Updates & Work Logs) | activity (WP2/WP3) | `/checklists/updates`, `/audit` | placeholder (`ComingSoon`), WP5 builds |
| `/audit-logs` | FOUNDER, FINANCE | audit | `/audit` | done |
| `/settings` | FOUNDER (Business Settings, tabs), PLANNER, EVENT_MANAGER, FINANCE (Finance Settings), OPERATIONS (Profile Preferences); NOT SYSADMIN / CLIENT / VENDOR | users + admin (`/settings/*`) | `/settings/*`, `/auth/*` | done (WP4) |
| `/admin/dashboard` | SYSADMIN | admin | `/admin/dashboard` | done |
| `/admin/users` | SYSADMIN | admin | `/users` | done |
| `/admin/roles` | SYSADMIN | admin | `/admin/roles` | done |
| `/admin/organization` | SYSADMIN | admin | `/admin/org` | done |
| `/admin/master-data` | SYSADMIN | admin | `/admin/master-data` | done |
| `/admin/configuration` | SYSADMIN | admin | `/admin/config` | done |
| `/admin/integrations` | SYSADMIN | admin | `/admin/integrations` | done |
| `/admin/email` | SYSADMIN | admin | `/admin/email` | done |
| `/admin/storage` | SYSADMIN | admin | `/admin/storage` | done |
| `/admin/monitoring` | SYSADMIN | admin | `/admin/monitoring` | done |
| `/admin/audit` | SYSADMIN | audit | `/audit` | done |
| `/admin/backups` | SYSADMIN | admin | `/admin/backups` | done |
| `/admin/maintenance` | SYSADMIN | admin | `/admin/maintenance` | done |
| `/admin/reports` | SYSADMIN | admin | `/admin/reports` | done |
| `/admin/support-logs` | SYSADMIN | admin | `/admin/support-logs` | done |
| `/client-portal/dashboard` | CLIENT | portal-client | `/portal/client/dashboard` | done |
| `/client-portal/wedding` | CLIENT | portal-client | `/portal/client/wedding` | done |
| `/client-portal/planner` | CLIENT | portal-client | `/portal/client/planner` | done |
| `/client-portal/schedule` | CLIENT | portal-client | `/portal/client/schedule` | done |
| `/client-portal/vendors` | CLIENT | portal-client | `/portal/client/vendors` | done |
| `/client-portal/guests` | CLIENT | portal-client | `/portal/client/guests` | done |
| `/client-portal/accommodation` | CLIENT | accommodation | `/portal/client/accommodation` | done |
| `/client-portal/transport` | CLIENT | transport | `/portal/client/transport` | done |
| `/client-portal/documents` | CLIENT | portal-client | `/portal/client/documents` | done |
| `/client-portal/payments` | CLIENT | portal-client | `/portal/client/payments` | done |
| `/client-portal/chat` | CLIENT | messaging | `/portal/client/chat` | done |
| `/client-portal/media` | CLIENT | media | `/portal/client/media` | done |
| `/client-portal/checklists` | CLIENT | checklists | `/portal/client/checklists` | done |
| `/client-portal/announcements` | CLIENT | announcements | `/portal/client/announcements` | done |
| `/client-portal/feedback` | CLIENT | feedback | `/portal/client/feedback` | done |
| `/client-portal/settings` | CLIENT | portal-client | `/portal/client/settings` | done |
| `/vendor-portal/dashboard` | VENDOR | portal-vendor | `/portal/vendor/dashboard` | done |
| `/vendor-portal/bookings` | VENDOR | portal-vendor | `/portal/vendor/bookings` | done |
| `/vendor-portal/rfqs` | VENDOR | portal-vendor | `/portal/vendor/rfqs` | done |
| `/vendor-portal/quotations` | VENDOR | portal-vendor | `/portal/vendor/quotations` | done |
| `/vendor-portal/contracts` | VENDOR | portal-vendor | `/portal/vendor/contracts` | done |
| `/vendor-portal/schedule` | VENDOR | portal-vendor | `/portal/vendor/schedule` | done |
| `/vendor-portal/deliverables` | VENDOR | portal-vendor | `/portal/vendor/deliverables` | done |
| `/vendor-portal/check-in` | VENDOR | portal-vendor | `/portal/vendor/check-in` | done |
| `/vendor-portal/invoices` | VENDOR | vendor-bills | `/portal/vendor/invoices` | done |
| `/vendor-portal/profile` | VENDOR | portal-vendor | `/portal/vendor/profile` | done |
| `/vendor-portal/documents` | VENDOR | portal-vendor | `/portal/vendor/documents` | done |
| `/vendor-portal/messages` | VENDOR | messaging | `/portal/vendor/messages` | done |
| `/vendor-portal/reviews` | VENDOR | portal-vendor | `/portal/vendor/reviews` | done |
| `/vendor-portal/tasks` | VENDOR | portal-vendor | `/portal/vendor/tasks` | done |
| `/vendor-portal/announcements` | VENDOR | announcements | `/portal/vendor/announcements` | done |
| `/vendor-portal/support` | VENDOR | feedback | `/portal/vendor/support` | done |
| `/vendor-portal/settings` | VENDOR | portal-vendor | `/portal/vendor/settings` | done |
| `/clients/[id]` | FOUNDER, PLANNER, FINANCE | clients | `/clients/:id` | done (detail, not in nav) |
| `/vendor-portal/rfqs/[id]` | VENDOR | portal-vendor | `/portal/vendor/rfqs/:id` | done (detail, not in nav) |

## Conventions for feature agents

- Role scoping: import `ScopeService` (global, `backend/src/common/scope.service.ts`) - `weddingWhere(user)`, `byWeddingId(user)`, `byVendorId(user)`, `assertWeddingAccess(user, id)`, `assertVendorAccess(user, vendorId)`. CLIENT sees only weddings of `user.coupleId`; VENDOR only `user.vendorId` rows (and weddings they are booked / invited on).
- `RolesGuard` is default-deny for CLIENT, VENDOR and SYSADMIN: a route is reachable by them only if `@Roles(...)` lists the role (see `G.CLIENT_PORTAL`, `G.VENDOR_PORTAL`, `G.SYSADMIN`, `G.STAFF_AND_CLIENT`, `G.STAFF_AND_VENDOR`, `G.EVERYONE`) or the handler has `@AllowExternal()`. FOUNDER always passes. Controllers with no `@Roles` stay staff-only.
- Permission modules/actions: `MODULES` in `backend/src/common/permissions.ts` and `frontend/lib/permissions.ts` (mirrored). The DB table `RolePermission` is seeded from `PERMISSION_MATRIX`; add your module's grants there.
- Sidebar `Dashboard` for external roles points at their own dashboard; `AppShell` redirects CLIENT / VENDOR / SYSADMIN away from areas outside their prefix (`/client-portal`, `/vendor-portal`, `/admin`).
- Replace the `ComingSoon` page; keep the route path. Add new routes to `lib/nav.ts` and this table.


## Sidebars (WP4, `frontend/lib/nav.ts`)

`NAV_BY_ROLE[role]` is a list of collapsible parent groups, each with the exact items of MASTER_SPEC section 7. Helpers: `navFor(role)`, `flatNav(role)`, `activeHref(role, pathname, search)` (most specific match wins: all item query params must match, then longest path), `SETTINGS_HREF` / `SETTINGS_LABEL` (profile menu link; SYSADMIN has none). Open groups are remembered per user in `localStorage` key `rk.nav.open.<userId>`; the group holding the current page is always open. Collapsed (72px) mode shows icons only, mobile drawer shows the full groups.

Items with `children` (Planner Procurement: RFQs, Quotation Comparison, POs) render indented under the parent. Items with `tag` show a qualifier badge (Finance Procurement & POs "Read-only", Finance Reports & Analytics "Limited", Planner Event Command Centre "Oversight").

### Query-param contract (role-aware views of ONE route; WP5 reads these with `useSearchParams`)

| route | params | used by (role: label) |
|---|---|---|
| `/weddings` | (role-aware list; WP5 adds `?view=my|drafts|...` tabs) | PLANNER "My Weddings", EVENT_MANAGER "Assigned Weddings", OPERATIONS "My Assigned Weddings" |
| `/proposals` | `?tab=agreements` | PLANNER "Agreements" |
| `/procurement` | `?tab=rfqs`, `?tab=comparison`, `?tab=pos`, `&new=1` opens the RFQ form | PLANNER children; legacy `/quotations`; topbar "Request Quotations" |
| `/tasks` | `?view=my`, `?view=checklists` | EVENT_MANAGER "My Tasks"/"Checklists", OPERATIONS same; legacy `/checklists` |
| `/command-centre` | `?view=today`, `?view=run-sheet`, `?view=arrivals` | EVENT_MANAGER "Today's Events"/"Run Sheet"/"Vendor Arrival Status", OPERATIONS "Assigned Run Sheet" |
| `/command-centre/vendor-checkin` | none | EVENT_MANAGER "Vendor Check-in" |
| `/guests` | `?tab=check-in` | EVENT_MANAGER "Check-in", OPERATIONS "Guest Check-in Support" |
| `/expenses` | `?tab=requests` | PLANNER "Expense Requests" |
| `/approvals` | `?view=mine` | PLANNER "My Approval Requests" (Finance "Approvals" has no params) |
| `/activity` | `?tab=work-logs` | OPERATIONS "Daily Updates & Work Logs" |
| `/settings` | FOUNDER `?tab=company|packages|services|pricing|milestones|thresholds|task-templates|wedding-templates|vendor-categories|locations|notifications|account` | FOUNDER "Business Settings" |
| `/admin/integrations` | `?tab=keycloak|smtp|payment-gateway|maps|other` | SYSADMIN Integrations group |
| `/admin/configuration` | `?tab=application` | SYSADMIN "Application Settings" |
| `/admin/email` | `?tab=configuration` | SYSADMIN "Mail Configuration" |
| `/admin/storage` | `?tab=config|buckets|monitoring` | SYSADMIN Storage group |
| `/admin/monitoring` | `?tab=api|database|redis|queues` | SYSADMIN System Health group |
| `/admin/audit` | `?tab=security` | SYSADMIN "Security Events" |

The admin pages currently render every section on one page and ignore `?tab=`; nav still highlights the first path match. WP5 should honour `?tab=` (scroll to / show the section).

## Legacy redirects (decision 8, `frontend/next.config.mjs`, `permanent: false`)

| from | to |
|---|---|
| `/todays-events` | `/command-centre?view=today` |
| `/vendor-checkin` | `/command-centre/vendor-checkin` |
| `/checklists` | `/tasks?view=checklists` |
| `/updates` | `/activity` |
| `/quotations` | `/procurement?tab=rfqs` |

The old `page.tsx` files are gone (moved, not copied). Other query params on the old URL are forwarded by Next.

## WP5 handoff

Moved page bodies (importable, unchanged behaviour; mount them inside the new locations, then delete them if you inline):

| old page | new component | mount in |
|---|---|---|
| `app/(dashboard)/todays-events/page.tsx` | `components/screens/todays-events-screen.tsx` `TodaysEventsScreen` | `/command-centre?view=today` |
| `app/(dashboard)/vendor-checkin/page.tsx` | `components/screens/vendor-checkin-screen.tsx` `VendorCheckinScreen` | already mounted by `app/(dashboard)/command-centre/vendor-checkin/page.tsx` |
| `app/(dashboard)/checklists/page.tsx` | `components/screens/checklists-screen.tsx` `ChecklistsScreen` | `/tasks?view=checklists` |
| `app/(dashboard)/updates/page.tsx` | `components/screens/updates-screen.tsx` `UpdatesScreen` (OPERATIONS-gated) | `/activity` (`?tab=work-logs`) |
| `app/(dashboard)/quotations/page.tsx` | `components/screens/quotations-screen.tsx` `QuotationsScreen` | `/procurement?tab=rfqs` (its "new" handler now returns to `/procurement?tab=rfqs`) |

New placeholder pages (`ComingSoon`, WP5 fills): `/vendor-payments`, `/activity`. Settings page parts live in `app/(dashboard)/settings/_components/` (`account.tsx`, `business-settings.tsx`).
Founder has no "Approvals" item in its spec sidebar: surface pending approvals on the dashboard / `/vendor-payments?tab=approvals`; `/approvals` itself stays routable.

## Backend `/settings/*` (FOUNDER only, SystemSetting-backed, audited)

`company-profile`, `pricing-defaults`, `payment-milestones`, `approval-limits`, `business-locations`, `wedding-templates`, `notification-policies` (GET + PUT each). Packages, service catalogue and vendor categories are MasterDataItem lists (`PACKAGE`, `SERVICE_CATEGORY`, `VENDOR_CATEGORY`, via `/admin/master-data`, Founder passes the guard); task templates are `/task-templates`.

## WP2 API additions (workflow backend)

| Method + path | Roles | Notes |
|---|---|---|
| `POST /weddings/:id/confirm` | PLANNER, FOUNDER | Draft -> CONFIRMED. 409 `error.reason = CONFIRMATION_BLOCKED`, `error.details.blockers` (AGREEMENT_NOT_SIGNED, PROPOSAL_NOT_ACCEPTED, DEPOSIT_NOT_VERIFIED). Idempotent (`alreadyConfirmed: true`). Generates planning tasks. |
| `GET /weddings/:id/readiness` | staff | `{agreementSigned, proposalAccepted, depositVerified, ready, blockers}` |
| `POST /weddings/:id/assign` | PLANNER, FOUNDER | `{userId}`: planner -> `plannerId`, event manager / operations -> takes over the open tasks of their role |
| `GET /weddings?view=drafts\|planning\|in_progress\|completed\|cancelled\|confirmed&bookingStatus=&executionStage=` | scoped | derived tabs (bookingStatus and executionStage stay separate) |
| `POST /tasks/generate`: `POST /weddings/:id/tasks/generate {subtype?: 'DAY_OF'}` | PLANNER, EVENT_MANAGER | 409 `BOOKING_NOT_CONFIRMED` for drafts |
| `POST /portal/client/agreements/:id/sign` `{signerName, signatureData}` / `.../reject` | CLIENT | own wedding only |
| `POST /agreements/:id/reject` | PLANNER | SENT -> REJECTED |
| `GET /portal/client/vendors` | CLIENT | `{locked:true, reason:'AGREEMENT_NOT_SIGNED', vendors:[], comparisons:[]}` until signed; then `{locked:false, vendors, comparisons}` |
| `POST /portal/client/vendors/selection` `{quotationId, note?}` | CLIENT | records the couple's preferred quotation (409 `AGREEMENT_NOT_SIGNED` while locked) |
| `GET /portal/client/documents` | CLIENT | adds `floorPlans: {locked, reason?|count}`; FLOOR_PLAN documents hidden while locked; direct download -> 403 `reason AGREEMENT_NOT_SIGNED` |
| `POST /quotations/requests/group/:rfqGroup/send` | PLANNER | sends DRAFT RFQs; 409 `AGREEMENT_NOT_SIGNED` until signed |
| `POST /quotations/requests/group/:rfqGroup/compare` | PLANNER | RECEIVED/UNDER_REVIEW -> COMPARED |
| `POST /quotations/:id/status` `{status}` | PLANNER | UNDER_REVIEW, COMPARED, REJECTED, CLOSED, EXPIRED via the transition table (SELECTED only through `/select`) |

Error envelope: `{ error: { code, message, reason?, details? } }`. `reason` is the machine-readable business code (`ILLEGAL_TRANSITION` with `details {entity, from, to, allowed}`, `AGREEMENT_NOT_SIGNED`, `CONFIRMATION_BLOCKED`, `BOOKING_NOT_CONFIRMED`, `CLIENT_SELECTION_REQUIRED`).
