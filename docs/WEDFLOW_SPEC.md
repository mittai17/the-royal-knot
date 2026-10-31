# WedFlow — reference spec (from the 8 reference screenshots)

Source images: `/tmp/claude-1000/-home-mittai-Projects-Odoo/ca1069dd-f732-468f-804b-03b209a9b782/scratchpad/ref/zippannaporan/*.jpeg`
(one image per role, in order 5.03.48 = Founder, 5.04.46 = Planner, 5.06.10 = Finance, 5.11.13 = Event Coordinator,
5.13.55 = Planning Team Member, 5.18.34 = Couple/Client, 5.20.33 = Vendor, 5.22.46 = System Admin).
Read the image for your role/module before building it. The screenshots are a FEATURE reference only:
keep the EXISTING UI look and feel (layout, components, colours in `frontend/`), do not copy the screenshot styling.

## Roles (8)
| # | Role | Existing enum | Notes |
|---|------|---------------|-------|
| 1 | Founder / Director | ADMIN | oversight, approvals, profitability |
| 2 | Wedding Planner | PLANNER | clients, proposals, planning |
| 3 | Finance Manager | FINANCE | invoices, bills, reconciliation, budgets |
| 4 | Event Coordinator | EVENT_MANAGER | live ops, run sheet, check-in, incidents |
| 5 | Planning Team Member | OPERATIONS | assigned tasks, assigned weddings |
| 6 | Couple / Client | CLIENT (new) | portal scoped to their own wedding |
| 7 | Vendor | VENDOR (new) | portal scoped to their own vendor record |
| 8 | System Administrator | SYSADMIN (new) | users, roles, config, infra |

## Modules per role (screens). `E` = already exists in the app, `N` = new
### Founder (1)
Dashboard E · Enquiries CRM E · Enquiry details E · Weddings E · Wedding 360 detail E · **Clients management N** (directory, wedding history, payment summary) ·
Vendors E (+ performance rating, bookings count) · **Procurement & Quotations (RFQ list, comparison, purchase orders N)** ·
Finance overview E · **Approvals Centre N** (pending/approved/history: vendor contract, extra expense, client discount, vendor payment; approve/reject/review) ·
**Team management N** (members, active weddings, workload, task completion) · Operations overview E · Guests & Logistics E · Reports & Analytics E ·
Documents E · **Audit Logs screen N** · **Settings & Configuration N** (wedding packages, approval limits, task templates, payment milestones, email templates, company settings, user mgmt)
### Wedding Planner (2)
Dashboard E · Enquiries E · My Weddings E · Clients N · Vendors E · Quotations & RFQs E · **Proposals & Agreements N** (proposals list, package selection, send for signature) ·
**Planning & Tasks E** · **Event Functions N** (timeline/calendar/run sheet, add function) · **Guests E** · **Accommodation N** · **Transport N** · Documents E ·
**Communications N** (client messages, vendor messages, team chat) · Reports E · Settings (planner) N
### Finance Manager (3)
Dashboard E (+ cash flow chart, payment status donut, top expenses) · **Client Invoices N** (create invoice, send, PDF, reminders, status Draft/Sent/Partially paid/Paid/Overdue) ·
**Client Payment details E** · **Vendor Bills (AP) N** (submitted/verified/approved/paid/overdue) · **Vendor Payments E** · **Expenses & extra charges E** · **Reconciliation E** (bank statement import, auto match) ·
Approvals N · **Financial Reports N** (profitability, receivables, vendor payments, expense analysis, GST summary, season performance; export) · **Budgets & Profitability N** · **Cash Flow N** · Purchase Orders N · Vendors (finance view) N · Documents E · Audit logs N · Settings (finance) N
### Event Coordinator (4)
Dashboard E · My Weddings E · **Today's Events N** · Event Functions N · **Run Sheet (event day) E (Command Centre)** · **Vendor check-in N** (expected/arrived/pending/delayed, mark arrival) ·
**Incidents N** (open/in progress/resolved, log, assign) · Guests E · Accommodation N · Transport N · **My Tasks E** · Communication N · Documents E · Reports (vendor punctuality, guest attendance) N · Settings N
### Planning Team Member (5)
Dashboard E · My Assigned Weddings E · My Tasks E · Event Functions N · Vendors (assigned) E · Guests E · Accommodation N · Transport N · **Checklists N** · Run Sheet E · Documents E ·
Communication (team chat, planner chat, vendor messages) N · **Updates & Reports N** (daily update, task report, event report) · **Calendar N** · **Notifications E** · Settings N
### Couple / Client (6) — portal scoped to own wedding only
Dashboard (days to go, task progress, guest count, payments completed, wedding progress) · My Wedding (overview, story, itinerary, vendors) · Our Planner · Event Schedule/Itinerary ·
Vendors & Services (view selected vendors) · Guests & RSVPs (manage list, import, send invitations, RSVP tracking) · Accommodation · Transport ·
Documents & Contracts (view/download, signed contracts) · Payments & Invoices (payment schedule, receipts, pay now) · Chat & Support (with planner) · Photos & Media (gallery, upload reference photos) ·
Checklists · Announcements & Updates · Feedback & Requests (submit request, attach files, track status) · Settings (profile, notification prefs, change password)
### Vendor (7) — portal scoped to own vendor record
Dashboard (total bookings, upcoming events, pending payments, new RFQs, rating) · My Bookings (confirmed) · **New RFQs / Opportunities** · RFQ details & submit quotation ·
My Quotations (submitted/under review/accepted/rejected) · Agreements & Contracts · Event Schedule (my events) · Service Deliverables · **Check-in / Check-out (event day)** ·
Invoices & Payments (upload invoice, payment history, settlement) · My Profile & Services · Documents · Communications (planner chat, announcements, support) · Reviews & Feedback · Tasks & Action items · Announcements · Support · Settings
### System Administrator (8)
Dashboard (total users, active roles, weddings, storage; user activity chart; system health) · **User Management** (create/edit/deactivate, assign roles, login history) ·
**Roles & Permissions** (role list, module permissions, RBAC) · **Organization Setup** (company profile, locations, business settings, logo) · **Master Data** (service categories, event functions, vendor categories) ·
**System Configuration** (currency, timezone, financial year, feature toggles: guest mgmt, payments, vendor portal, mobile access) · **Integrations** (Keycloak, SMTP, payment gateway, maps; test connection) ·
**Email & Notifications** (templates, trigger settings) · **File Storage (MinIO)** (buckets, usage, files) · **System Monitoring** (service status, uptime, CPU/memory/storage) ·
**Audit Logs & Security** · **Backups & Recovery** (list, trigger, download, restore status) · **Maintenance** (clear cache, reindex, optimise, health check, update) · Reports (user activity, module usage, errors, storage) · Support & Logs · Settings

## Cross-cutting modules to add (backend + schema)
Approvals · Clients (view over Couple) · Purchase Orders · Client Invoices · Vendor Bills · Budgets · Cash-flow report · Accommodation (hotels, rooms, allocations, guest check-in/out) ·
Transport (vehicles, drivers, trips, guest transport) · Messaging (threads/messages: client↔planner, vendor↔planner, team, 4 channels) · Announcements · Feedback/Requests ·
Photos & Media (MinIO gallery) · Checklists · Proposals · Vendor reviews/ratings · Master data · Org settings / system config (key-value) · Integrations config · Email templates ·
Backups (record + trigger) · Maintenance actions · Role/permission editing (DB-backed permission matrix, seeded from `backend/src/common/permissions.ts`).
