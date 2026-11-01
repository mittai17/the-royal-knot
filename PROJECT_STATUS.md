# PROJECT_STATUS


## Deployment (DevOps / Integration agent)
**Done and verified (2026-10-31)**
- Dokploy v0.30.10 installed (swarm + `dokploy`, `dokploy-postgres`, `dokploy-traefik`); panel at http://localhost:3000. Admin login is in `~/.royalknot-dokploy-credentials` (mode 600).
- **The app is deployed in Dokploy**: project "The Royal Knot", Raw compose app `royalknot` (id `oaUHTAfFgCAx7inLi2Uff`) from `deploy/docker-compose.images.yml`, 7 containers healthy, served via Traefik at `http://royalknot.localhost` (port 80). Secrets live only in Dokploy's Environment tab.
- Through that deployment: login (`founder@royalknot.local`), 25 weddings, health (db/redis/minio/gotenberg up), WebSocket live `incident.created`, MinIO upload/download byte-identical, agreement + reconciliation PDFs, all verified.
- Plain `docker compose build` + up (separate project, port 3200) also verified: 3 migrations, seed, 7 healthy services; that stack was torn down.
- Scripts exercised for real: `backup.sh`/`restore.sh` (Postgres restore proven by delete-then-restore; MinIO files still download), `offline-save.sh` (1.1 GB, 7 images) and `offline-load.sh`.
- Fixes made: backend `package-lock.json` was out of sync (even on the host) and was regenerated with `npm install --package-lock-only` (versions unchanged: Nest 11.1.6, Prisma 6.19.3, TS 5.8.3); Dockerfiles now install npm 12 before `npm ci`; `docker-compose.yml` gained `image:` tags; added `deploy/scripts/make-image-only-compose.py`.
- Left running on the Docker host, not mine: a swarm service `hello-world-...` in Dokploy's default "My First Project".

**Not done / unverified**
- Git-sourced Dokploy deploy (the repo is not a git repo), HTTPS, a second machine, a truly air-gapped run (Dokploy's own installer and images still need internet).
- Dokploy Raw deploys use locally built image tags, so a rebuild needs `docker compose build` then Redeploy in Dokploy.
- `SEED_ON_START` was set back to `false` in Dokploy after the first boot and the app redeployed; data persisted (25 weddings, login works).
- Seed password `RoyalKnot@2026` is dev-only and users are flagged `mustChangePassword`; change before any real use.

## Frontend (Frontend agent)
Stack: Next.js 15 (App Router) + React 19, TS strict, Tailwind 3, Recharts, TanStack Table 8, react-hook-form + zod, socket.io-client, sonner. Runs on :3100 and proxies `/api/*` and `/socket.io` to `BACKEND_URL` (same-origin cookies).

**Done and verified against the live backend + seeded data** (headless Chromium via Playwright, screenshots reviewed)
- Shell: 14-item sidebar (expanded / collapsed / mobile drawer), top bar (global search, workspace, wedding selector, notifications, quick-create, profile), login with bad-credential error, middleware gate, silent session resume via refresh cookie.
- Screens, all on real API calls with loading / error / empty states: Dashboard, Enquiries (list, pipeline board with drag, detail, activity log, convert to wedding), Weddings (cards + workspace with 11 tabs), Vendors, Quotations (RFQ, line-item entry, 3-way comparison, confirm-select dialog), Planning & Tasks (Kanban / List / Calendar / Timeline), Event Command Centre (live), Guests (server paging, stats, CSV import, check-in), Payments (milestones, receipts, vendor payments), Expenses & Reconciliation, Reports & Analytics, Documents (upload, versions, role restriction, preview, download), Team, Settings.
- Agreements: generate from template, mobile-friendly signature pad (pointer events), PDF link.
- Financial writes send idempotency keys (client payments, vendor settlement).
- Live: Command Centre re-reads PostgreSQL on every socket event and after reconnect; an incident created via API appeared without reload (e2e).
- `npm run build` (incl. lint + types) passes; `tsc --noEmit` clean.
- Playwright (`frontend/e2e/smoke.spec.ts`, 8 tests) pass: login errors, auth redirect, all 14 screens load with zero 4xx/5xx API responses, quotation comparison highlights + decision state, command centre live badge + seeded incidents, 60 x 1,200 = 72,000 reconciliation, enquiry creation through the form, live incident push.

**Fixes worth knowing**
- npm resolved TypeScript 7 (Next 15 cannot read tsconfig with it) and TanStack Table v9 alpha; both are pinned (`typescript@5`, `@tanstack/react-table@8`). Keep the lockfile in Docker builds.
- `next.config.mjs` sets `skipTrailingSlashRedirect` and an explicit `/socket.io` rewrite, otherwise the Socket.IO handshake through the proxy 404s. WebSocket upgrade through the Next proxy is not verified; the client uses polling-then-upgrade, so it works on polling alone. In Dokploy, routing `/socket.io` straight to the backend via Traefik is the better setup.

**UI polish / QA pass (verified)**
- Browser-extension control was not available in this environment; all checks used the Playwright Chromium. I looked at screenshots of every sidebar screen at 1440 px, and of all 11 wedding tabs, quotation comparison and Command Centre. I looked closely at mobile (390 px) for dashboard, enquiries, tasks, command centre and payments. Tablet (820 px) was checked by the automated sweep only (no overflow, no console/API errors), not by eye.
- Automated sweep `e2e/qa.spec.ts` (every screen + 11 wedding tabs x 3 viewports): founder, operations (sana), event manager (priya) finished with 0 console errors, 0 failed API calls and 0 horizontal page overflow after the fixes. Finance (meera) and planner (neha) were swept before the last round of edits and also had 0 issues.
- Fixed: dashboard panel overflow (Task Overview legend, Upcoming Payments / Live Vendor titles), truncated vendor names, KPI labels on narrow widths, mobile page overflow (cards need `min-w-0`), Kanban columns clipped at 1440 px, Command Centre vendor list stretching the page (now scrolls, incidents first), Expenses chart (horizontal bars sized to the data), Documents "Uploaded" column wrapping, wide tables (first column stays pinned, min width 720 px so they scroll inside the card), milestone order (Booking, Advance, Final), "signed in" audit noise in Recent Activity, Settings checklist templates collapsed by default, wedding selector reachable on mobile.
- Role-aware UI (mirrors `backend/src/common/permissions.ts` in `frontend/lib/permissions.ts`): sidebar items, quick-create menu, write buttons, Payments/Expenses/Reports page gate, wedding Payments/Expenses tabs and the Command Centre controls are hidden or disabled for roles the API refuses. Before this the UI offered actions that returned 403.
- `e2e/flows.spec.ts` (7 UI-driven tests, run against a fresh wedding so demo data is untouched) pass: agreement generate + drawn signature + sign, document upload then byte-identical download, CSV guest import (12 rows), finance recording the booking milestone in the UI which generates >25 tasks, Kanban drag persisting status, vendor quote selection then a vendor advance recorded once, role-restricted UI for finance and operations. With `smoke.spec.ts` that is 15/15 passing on the production build (`npm run build` + `tsc --noEmit` clean).

**Not done / limitations**
- Vendor settle (invoice + settle modal) and charge approval are role-gated and typed, but have no UI test; the backend settle flow is covered by backend e2e tests.
- Event-day timeline buttons, arrival buttons and incident resolve have no UI test beyond the live-incident push test.
- Planner/finance were not re-swept after the last cosmetic header change; founder/ops/event-manager were.
- The full suite fires many logins and can hit the backend login limit (`AUTH_RATE_LIMIT`, default 10/min); run with `--workers=1` or raise the limit for CI.
- Pages that call endpoints the backend does not provide were removed (no summary/profitability PDF buttons).
- The wedding selector's last choice is kept in localStorage (per-viewer convenience only).
- Hero banner and wedding card covers are CSS gradients/SVG, not photographs (no external image hosts by design), so they are plainer than the reference image.
- Test runs left some rows in the dev database (an "E2E" enquiry, a few uploaded test documents, extra "Flow Bride" weddings). Re-run the seed for a clean demo.
- The seeded Booking milestone is due after the Advance milestone (backend seed data); the UI now orders by milestone type regardless.

### Keycloak sign-in, health and system status (Frontend-Keycloak agent)
**Built and verified (tsc + `next build` clean; Playwright health/status/smoke tests pass against the dev server on :3100)**
- `GET /api/health` Next route handler: 200 JSON, no backend dependency (for the container healthcheck).
- Public `/system-status` page (excluded from the auth middleware) with live service cards from `GET /api/v1/system/status`, 30 s auto-refresh, manual refresh, and an error state when the API is unreachable.
- `lib/config.ts` reads `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_KEYCLOAK_URL/REALM/CLIENT_ID`, `NEXT_PUBLIC_DEMO_MODE`. With none set the app stays same-origin (`/api/v1` rewrite, `/socket.io` rewrite). `lib/api.ts`, `apiUrl()` links and the Socket.IO client all use it. `next.config.mjs` still has `output: 'standalone'`.

**Written but NOT verified against a real backend (the endpoints did not exist yet when I finished)**
- Login page: "Email & password / Keycloak" tabs (only when `GET /auth/keycloak/config` returns `enabled`), and a 1-click demo role switcher for the 5 `@royalknot.in` accounts (only when the build has `NEXT_PUBLIC_DEMO_MODE=true`) that posts to `/auth/keycloak/login`. Profile menu (avatar) now has Sign out and, in demo mode, a role switcher.
- The 3 Keycloak Playwright tests in `e2e/keycloak.spec.ts` are skipped until the backend reports Keycloak enabled; they have never run green.
- The `/system-status` cards have only been seen in their error state so far (backend endpoint missing).

**Caveats**
- `NEXT_PUBLIC_*` values are baked at build time; the Docker build must pass them as build args.
- If `NEXT_PUBLIC_API_URL` points at a different host (e.g. `api.` vs `app.`), the auth middleware only sees the `access_token` cookie if the backend sets it on the parent domain; otherwise leave it unset and use the same-origin rewrite.
- The profile avatar is now visible below the `lg` breakpoint too (it gives mobile users a sign-out); not re-checked visually on mobile.
- The host dev server on :3100 was rebuilt with `NEXT_PUBLIC_DEMO_MODE=true`.

## Backend (Backend agent)
NestJS 11 + Prisma 6 + PostgreSQL 16, port 4000, prefix `/api/v1`. Full notes in `backend/README.md`; ER plan in `backend/docs/ER.md`.

**Done and verified (real Postgres, Redis, MinIO, Gotenberg — no mocks)**
- Schema (37 models) + 3 migrations (init, integrity constraints incl. one-ACCEPTED-quote-per-RFQ partial unique index and positive-money CHECKs, cascade fixes). All money `Decimal(14,2)`.
- All 17 feature modules (plus audit, jobs, health, websocket) with controllers/services/DTOs: auth (argon2, JWT cookies, refresh rotation + reuse detection, throttling, change-password), users/teams, enquiries (+convert), weddings/couples/events, agreements (templates, versions, PNG signature capture, signed PDF stored in MinIO), vendors, quotations (RFQ ≥3 vendors, structured lines, comparison, transactional select), tasks (33/27-item reusable templates, idempotent generation, dependencies), events (timeline, arrivals, incidents, actual guests; persist-then-broadcast), guests (CSV import, stats, check-in), payments (milestones, idempotency, receipts PDF, vendor payments), expenses (approval, planned vs actual), reconciliation (auto extra-guest charge, approvals, vendor settlement, statement PDF), analytics (overview, profitability, vendors, team, dashboard, global search), documents (MinIO, versions, role access, preview/download), notifications, audit, BullMQ jobs, health, Swagger (98 paths).
- Seed (`npm run seed:dev` / `npm run seed`): 9 users (all 5 roles), 26 vendors, 25 weddings, 9 enquiries, 669 tasks, 450 guests. Mehta Wedding is driven through the real services (enquiry → agreement signed → 3 caterer quotes → Royal Caterers selected (not the cheapest) → booking payment auto-generates 33 tasks → 18 vendors → event day with delayed DJ + incidents → 400 expected / 460 actual → ₹72,000 charge → partial vendor settlement).
- Tests: **66 unit + 58 end-to-end all passing** (the 24 + 6 added for Keycloak/status/UPI; earlier coverage: (financial edge cases, RBAC, refresh reuse, CSRF origin, quotation select race, payment/vendor-settlement idempotency and concurrency, task-generation idempotency, socket broadcast + auth + reconnect, documents, profitability maths, report job)).
- Fixed along the way: Nest 12 / Prisma 8 RC were ESM-only or mismatched → pinned Nest 11 / Prisma 6; socket auth ran after the connect ack (join-before-auth race) → moved to namespace middleware; concurrent quote selection deadlocked (500) → group row lock + P2034→409; deleting a wedding was blocked by RESTRICT FKs → cascades.
- Compose compatibility: backend accepts `JWT_ACCESS_SECRET`, `CORS_ORIGIN`, `MAIL_FROM`; refuses to boot in production with a weak/dev JWT secret; `npm run seed` runs from compiled `dist/_seed` (verified from a directory without `src/`).

**Keycloak integration, health/status, UPI (Backend-Keycloak agent) — verified against the real Keycloak at http://keycloak.localhost**
- `KEYCLOAK_ENABLED` flag; endpoints `GET /auth/keycloak/config`, `POST /auth/keycloak/login`; bearer-token acceptance for RS256 Keycloak tokens with split-horizon validation (JWKS via internal URL, public issuer accepted). Live checks: password-grant login set the cookie session (arjun → FOUNDER); raw bearer tokens for all 5 users resolved to FOUNDER/PLANNER/EVENT_MANAGER/FINANCE/OPERATIONS and the role rules held (event manager and operations got 403 on `/payments/milestones`); a tampered token and garbage got 401; wrong password got 401; flag off gave 404 on both endpoints, `keycloak: disabled` in health, and 401 for an RS256 bearer.
- Unit tests use a locally generated RSA key and a local JWKS: public/internal issuer accepted; foreign issuer, wrong key, expired, wrong `azp`, unknown `kid` rejected; role mapping and user upsert (create, role sync, no-op, disabled, no email, no role).
- Seed is now idempotent: no-op when already seeded (only upserts the 5 `@royalknot.in` users with ids `1111…`–`5555…`); `SEED_FORCE=true`/`npm run seed:reset` wipes and rebuilds. Verified: second run left users 14 / weddings 25 / tasks 669 / payments 39 / Mehta id unchanged; forced reset rebuilt the full dataset.
- Health now includes Keycloak; `GET /system/status` returns per-service latency (matches what the frontend `/system-status` page expects: `data.services.<name>.{status,latencyMs}`). `GET /payments/upi-qr` returns a UPI deep link (no Hyperswitch integration; payment tracking stays local).
- **Not verified / caveats:** the backend ran against Keycloak only on the host with `KEYCLOAK_INTERNAL_URL=http://keycloak.localhost`; the Docker-internal URL `http://keycloak:8080` and an `https://auth.<domain>` public issuer are untested here. The realm import JSON (fixed user ids) is the DevOps agent's file; I created the spec roles and users in the live realm through the admin API for testing. The live realm's `royalknot-web` client now has direct access grants enabled (needed for the password grant). Keycloak's own `/health/ready` (management port) is not used; health probes the realm's `.well-known` instead.

**Limitations / not done (honest list)**
- Simplified schema vs the spec's entity list: roles are an enum with the permission matrix in code (no Role/Permission tables); `GuestGroup`/`GuestInvitation`/`GuestCheckIn` are columns on `Guest`; `WeddingPackage` and `VendorCategory` are enums; `EventTimeline` is `TimelineItem`; `Client` is `Couple`.
- Rate limiting uses the in-memory throttler store (per instance, not Redis-backed).
- Email: only payment reminders are queued to SMTP; delivery to Mailpit was not checked end to end.
- Not covered by automated tests: quotation PDF endpoint, `event.status` / `task.updated` broadcasts, upload size limit, bulk CSV of 400+ rows, profitability report job, team/workload endpoints (they run in the dashboard/seed paths).
- One reconciliation per wedding; the automatic extra-guest charge uses the wedding's first catering vendor if several exist.
- First boot runs a reminder scan which turns the seeded overdue tasks/payments into notifications (expected for demo data).
- Seed dates are relative to the day it is first run (Mehta is always on its 3rd/last event day).
- Dokploy deployment and the production Docker image were not exercised by me (DevOps agent's scope); the compiled-seed path was.
