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

**Not done / limitations**
- No browser-extension control was available; visual checks used Playwright screenshots, and I reviewed only dashboard, command centre, quotation comparison and reconciliation closely. Other screens are asserted by the smoke test, not by eye.
- Responsive/mobile layouts were not inspected on a real small viewport.
- Not exercised by tests: agreement signing, document upload/preview, CSV import, task drag-and-drop, quotation select (decision is already made in seed data), vendor payment, settle, role-restricted views (only the Founder login was used).
- Pages that call endpoints the backend does not provide were removed (no summary/profitability PDF buttons). `/users/:id` is used for team activity.
- The wedding selector's last choice is kept in localStorage (per-viewer convenience only).
- Dashboard shows 190 pending tasks and a Pending/Overdue donut computed from seed data; nothing is hardcoded.

## Backend (Backend agent)
NestJS 11 + Prisma 6 + PostgreSQL 16, port 4000, prefix `/api/v1`. Full notes in `backend/README.md`; ER plan in `backend/docs/ER.md`.

**Done and verified (real Postgres, Redis, MinIO, Gotenberg — no mocks)**
- Schema (37 models) + 3 migrations (init, integrity constraints incl. one-ACCEPTED-quote-per-RFQ partial unique index and positive-money CHECKs, cascade fixes). All money `Decimal(14,2)`.
- All 17 feature modules (plus audit, jobs, health, websocket) with controllers/services/DTOs: auth (argon2, JWT cookies, refresh rotation + reuse detection, throttling, change-password), users/teams, enquiries (+convert), weddings/couples/events, agreements (templates, versions, PNG signature capture, signed PDF stored in MinIO), vendors, quotations (RFQ ≥3 vendors, structured lines, comparison, transactional select), tasks (33/27-item reusable templates, idempotent generation, dependencies), events (timeline, arrivals, incidents, actual guests; persist-then-broadcast), guests (CSV import, stats, check-in), payments (milestones, idempotency, receipts PDF, vendor payments), expenses (approval, planned vs actual), reconciliation (auto extra-guest charge, approvals, vendor settlement, statement PDF), analytics (overview, profitability, vendors, team, dashboard, global search), documents (MinIO, versions, role access, preview/download), notifications, audit, BullMQ jobs, health, Swagger (98 paths).
- Seed (`npm run seed:dev` / `npm run seed`): 9 users (all 5 roles), 26 vendors, 25 weddings, 9 enquiries, 669 tasks, 450 guests. Mehta Wedding is driven through the real services (enquiry → agreement signed → 3 caterer quotes → Royal Caterers selected (not the cheapest) → booking payment auto-generates 33 tasks → 18 vendors → event day with delayed DJ + incidents → 400 expected / 460 actual → ₹72,000 charge → partial vendor settlement).
- Tests: **42 unit + 52 end-to-end all passing** (financial edge cases, RBAC, refresh reuse, CSRF origin, quotation select race, payment/vendor-settlement idempotency and concurrency, task-generation idempotency, socket broadcast + auth + reconnect, documents, profitability maths, report job).
- Fixed along the way: Nest 12 / Prisma 8 RC were ESM-only or mismatched → pinned Nest 11 / Prisma 6; socket auth ran after the connect ack (join-before-auth race) → moved to namespace middleware; concurrent quote selection deadlocked (500) → group row lock + P2034→409; deleting a wedding was blocked by RESTRICT FKs → cascades.
- Compose compatibility: backend accepts `JWT_ACCESS_SECRET`, `CORS_ORIGIN`, `MAIL_FROM`; refuses to boot in production with a weak/dev JWT secret; `npm run seed` runs from compiled `dist/_seed` (verified from a directory without `src/`).

**Limitations / not done (honest list)**
- Simplified schema vs the spec's entity list: roles are an enum with the permission matrix in code (no Role/Permission tables); `GuestGroup`/`GuestInvitation`/`GuestCheckIn` are columns on `Guest`; `WeddingPackage` and `VendorCategory` are enums; `EventTimeline` is `TimelineItem`; `Client` is `Couple`.
- Rate limiting uses the in-memory throttler store (per instance, not Redis-backed).
- Email: only payment reminders are queued to SMTP; delivery to Mailpit was not checked end to end.
- Not covered by automated tests: quotation PDF endpoint, `event.status` / `task.updated` broadcasts, upload size limit, bulk CSV of 400+ rows, profitability report job, team/workload endpoints (they run in the dashboard/seed paths).
- One reconciliation per wedding; the automatic extra-guest charge uses the wedding's first catering vendor if several exist.
- First boot runs a reminder scan which turns the seeded overdue tasks/payments into notifications (expected for demo data).
- Seed dates are relative to the day it is run (Mehta is always on its 3rd/last event day).
- Dokploy deployment and the production Docker image were not exercised by me (DevOps agent's scope); the compiled-seed path was.
