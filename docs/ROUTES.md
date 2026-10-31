# Routes (WedFlow)

Frontend route | role(s) | owner module | backend prefix. Status `exists` = already built before the foundation; `stub` = placeholder (`ComingSoon`) to be filled in by the owner module.

Owner module = directory under `backend/src/modules/<owner>` (Nest module already registered in `app.module.ts`). Backend prefixes are relative to `/api/v1`.
Nav entries live in `frontend/lib/nav.ts` (explicit roles, ADMIN not implicit); pages under `frontend/app/(dashboard)/<route>/page.tsx`.

| route | role(s) | owner module | backend prefix | status |
|---|---|---|---|---|
| `/dashboard` | ADMIN, PLANNER, EVENT_MANAGER, FINANCE, OPERATIONS | analytics | `/analytics` | exists |
| `/enquiries` | ADMIN, PLANNER | enquiries | `/enquiries` | exists |
| `/clients` | ADMIN, PLANNER, FINANCE | clients | `/clients` | done |
| `/weddings` | ADMIN, PLANNER, EVENT_MANAGER, FINANCE, OPERATIONS | weddings | `/weddings` | exists |
| `/vendors` | ADMIN, PLANNER, EVENT_MANAGER, FINANCE, OPERATIONS | vendors | `/vendors` | exists |
| `/quotations` | ADMIN, PLANNER | quotations | `/quotations` | exists |
| `/procurement` | ADMIN, PLANNER, FINANCE | procurement | `/procurement` | done |
| `/proposals` | ADMIN, PLANNER | proposals | `/proposals` | done |
| `/tasks` | ADMIN, PLANNER, EVENT_MANAGER, OPERATIONS | tasks | `/tasks` | exists |
| `/event-functions` | ADMIN, PLANNER, EVENT_MANAGER, OPERATIONS | events | `/events` | done |
| `/todays-events` | ADMIN, EVENT_MANAGER | events | `/events` | done |
| `/command-centre` | ADMIN, PLANNER, EVENT_MANAGER, OPERATIONS | events | `/events` | exists |
| `/vendor-checkin` | ADMIN, EVENT_MANAGER | events | `/events/arrivals` | done |
| `/incidents` | ADMIN, PLANNER, EVENT_MANAGER, OPERATIONS | events | `/events/incidents` | done |
| `/guests` | ADMIN, PLANNER, EVENT_MANAGER, OPERATIONS | guests | `/guests` | exists |
| `/accommodation` | ADMIN, PLANNER, EVENT_MANAGER, OPERATIONS | accommodation | `/accommodation` | done |
| `/transport` | ADMIN, PLANNER, EVENT_MANAGER, OPERATIONS | transport | `/transport` | done |
| `/checklists` | ADMIN, PLANNER, EVENT_MANAGER, OPERATIONS | checklists | `/checklists` | done |
| `/calendar` | ADMIN, PLANNER, EVENT_MANAGER, OPERATIONS | events | `/events/calendar` | done |
| `/updates` | ADMIN, OPERATIONS | checklists | `/checklists/updates` | done |
| `/communications` | ADMIN, PLANNER, EVENT_MANAGER, FINANCE, OPERATIONS | messaging | `/messaging` | done |
| `/announcements` | ADMIN, PLANNER, EVENT_MANAGER | announcements | `/announcements` | done |
| `/feedback` | ADMIN, PLANNER, EVENT_MANAGER | feedback | `/feedback` | done |
| `/approvals` | ADMIN, PLANNER, FINANCE | approvals | `/approvals` | done |
| `/payments` | ADMIN, PLANNER, FINANCE | payments | `/payments` | exists |
| `/invoices` | ADMIN, FINANCE | invoices | `/invoices` | done |
| `/vendor-bills` | ADMIN, FINANCE | vendor-bills | `/vendor-bills` | done |
| `/expenses` | ADMIN, PLANNER, FINANCE | expenses | `/expenses` | exists |
| `/budgets` | ADMIN, FINANCE | budgets | `/budgets` | done |
| `/cash-flow` | ADMIN, FINANCE | budgets | `/budgets/cash-flow` | done |
| `/financial-reports` | ADMIN, FINANCE | analytics | `/analytics/financial` | done |
| `/reports` | ADMIN, FINANCE | analytics | `/analytics` | exists |
| `/documents` | ADMIN, PLANNER, EVENT_MANAGER, FINANCE, OPERATIONS | documents | `/documents` | exists |
| `/notifications` | ADMIN, PLANNER, EVENT_MANAGER, FINANCE, OPERATIONS | notifications | `/notifications` | done |
| `/team` | ADMIN, PLANNER | users | `/users` | exists |
| `/audit-logs` | ADMIN, FINANCE | audit | `/audit` | done |
| `/settings` | ADMIN, PLANNER, EVENT_MANAGER, FINANCE, OPERATIONS, SYSADMIN | users | `/users` | exists |
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
| `/clients/[id]` | ADMIN, PLANNER, FINANCE | clients | `/clients/:id` | done (detail, not in nav) |
| `/vendor-portal/rfqs/[id]` | VENDOR | portal-vendor | `/portal/vendor/rfqs/:id` | done (detail, not in nav) |

## Conventions for feature agents

- Role scoping: import `ScopeService` (global, `backend/src/common/scope.service.ts`) - `weddingWhere(user)`, `byWeddingId(user)`, `byVendorId(user)`, `assertWeddingAccess(user, id)`, `assertVendorAccess(user, vendorId)`. CLIENT sees only weddings of `user.coupleId`; VENDOR only `user.vendorId` rows (and weddings they are booked / invited on).
- `RolesGuard` is default-deny for CLIENT, VENDOR and SYSADMIN: a route is reachable by them only if `@Roles(...)` lists the role (see `G.CLIENT_PORTAL`, `G.VENDOR_PORTAL`, `G.SYSADMIN`, `G.STAFF_AND_CLIENT`, `G.STAFF_AND_VENDOR`, `G.EVERYONE`) or the handler has `@AllowExternal()`. ADMIN always passes. Controllers with no `@Roles` stay staff-only.
- Permission modules/actions: `MODULES` in `backend/src/common/permissions.ts` and `frontend/lib/permissions.ts` (mirrored). The DB table `RolePermission` is seeded from `PERMISSION_MATRIX`; add your module's grants there.
- Sidebar `Dashboard` for external roles points at their own dashboard; `AppShell` redirects CLIENT / VENDOR / SYSADMIN away from areas outside their prefix (`/client-portal`, `/vendor-portal`, `/admin`).
- Replace the `ComingSoon` page; keep the route path. Add new routes to `lib/nav.ts` and this table.
