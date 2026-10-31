# The Royal Knot — Backend (NestJS + Prisma + PostgreSQL)

REST API + Socket.IO gateway for the wedding operations platform. Everything is self-hosted: PostgreSQL, Redis/BullMQ, MinIO, Gotenberg, Mailpit.

- Base URL `http://localhost:4000/api/v1` · Swagger `http://localhost:4000/api/docs` (98 paths) · health `GET /api/v1/health`
- Success: `{ "data": …, "meta"?: { page, pageSize, total } }` · Error: `{ "error": { code, message, details? } }`
- **Money is returned as decimal strings (INR)**, stored as `Decimal(14,2)`. Never parse with `parseFloat` for arithmetic.
- Lists accept `page`, `pageSize`, `search`, `sort`, `order` plus module filters.

## Run locally
```bash
docker compose -f ../docker-compose.infra.yml up -d      # postgres, redis, minio, gotenberg, mailpit
cp .env.example .env                                      # dev values are already in .env for localhost
npm ci --legacy-peer-deps
npx prisma migrate deploy                                 # apply migrations (use `migrate dev` while developing)
npm run seed:dev                                          # seeds demo data; no-op if already seeded (see Seeding)
npm run start:dev                                         # http://localhost:4000
```
Production build: `npm run build` (also compiles the seed into `dist/_seed`), then `node dist/main.js`; `npm run seed` uses the compiled seed. **If you change `prisma/seed.ts`, re-run `npx tsc -p tsconfig.seed.json` (or `npm run build`) — `npm run seed` prefers the stale compiled copy.**

### Seeding (idempotent)
- `npm run seed` / `SEED_ON_START=true`: if the demo dataset is already present (≥ 25 weddings and the Mehta Wedding) the run changes nothing except upserting the 5 Keycloak demo users by email. Safe to run on every redeploy; verified by running it twice and diffing row counts.
- `npm run seed:reset` (or `SEED_FORCE=true`): wipes **all** data and rebuilds the full dataset. Dev only.

## Environment
| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL |
| `JWT_SECRET` (or `JWT_ACCESS_SECRET`) | Signs access tokens. **Server refuses to start in production with the dev default or < 24 chars.** |
| `FRONTEND_URL` (or `CORS_ORIGIN`) | Allowed browser origin(s), comma-separated. Used for CORS, the CSRF Origin check and the WebSocket Origin check |
| `COOKIE_SECURE` | `true` behind HTTPS |
| `REDIS_URL` | BullMQ |
| `MINIO_ENDPOINT/PORT/ACCESS_KEY/SECRET_KEY/BUCKET/USE_SSL` | File storage |
| `GOTENBERG_URL` | PDF rendering |
| `SMTP_HOST/PORT`, `SMTP_FROM` (or `MAIL_FROM`) | Optional email (Mailpit locally) |
| `AUTH_RATE_LIMIT` | Login attempts per minute per IP (default 10) |
| `DISABLE_JOBS` | `true` skips registering the repeating reminder scan |
| `DEMO_PASSWORD` | Seed only |
| `SEED_FORCE` | `true` makes the seed wipe and rebuild (default: skip when already seeded) |
| `KEYCLOAK_ENABLED` | `true` turns on the optional Keycloak integration (default `false`; built-in auth is always on) |
| `KEYCLOAK_INTERNAL_URL` | How the backend reaches Keycloak, e.g. `http://keycloak:8080` (JWKS, password grant, health) |
| `KEYCLOAK_REALM` / `KEYCLOAK_CLIENT_ID` | Default `royalknot` / `royalknot-web` (also accepted as `azp`: `KEYCLOAK_API_CLIENT_ID`, default `royalknot-api`) |
| `KEYCLOAK_PUBLIC_ISSUER` | The issuer browsers see, e.g. `https://auth.example.com/realms/royalknot`. Defaults to the internal issuer |
| `KEYCLOAK_CLIENT_SECRET` | Only if the login client is confidential |
| `UPI_VPA` | Payee VPA used in UPI deep links (default `royalknot@upi`) |

`JWT_REFRESH_SECRET` is accepted by the compose file but not needed: refresh tokens are opaque random values stored as SHA-256 hashes.

## Demo accounts (development only — seeded with `DEMO_PASSWORD`, default `RoyalKnot@2026`)
| Login | Role | Name |
|---|---|---|
| founder@royalknot.local | Founder / Admin | Aarav Royal |
| neha@ / arjun@ / rahul@royalknot.local | Wedding Planner | Neha Kapoor / Arjun Mehta / Rahul Singh |
| priya@ / karan@royalknot.local | Event Manager | Priya Sharma / Karan Joshi |
| meera@royalknot.local | Finance Manager | Meera Iyer |
| vikram@ / sana@royalknot.local | Operations Staff | Vikram Rathore / Sana Qureshi |

### Keycloak demo users (also seeded into the app database; same password)
| Login | Keycloak realm role | App role | Fixed id |
|---|---|---|---|
| arjun@royalknot.in | `FOUNDER` | Admin | `11111111-…` |
| priya@royalknot.in | `WEDDING_PLANNER` | Planner | `22222222-…` |
| kabir@royalknot.in | `EVENT_MANAGER` | Event Manager | `33333333-…` |
| meera@royalknot.in | `FINANCE_MANAGER` | Finance | `44444444-…` |
| rohan@royalknot.in | `OPS_STAFF` | Operations | `55555555-…` |
| rahul.priya@gmail.com | `CLIENT` | Client (Mehta wedding) | `66666666-…` |
| vendor@royalcaterers.com | `VENDOR` | Vendor (Royal Caterers) | `77777777-…` |
| admin@royalknot.in | `SYSTEM_ADMIN` | System Administrator | `88888888-…` |

These also work with the built-in `/auth/login`.

**Change `DEMO_PASSWORD` before seeding any shared environment.** With `NODE_ENV=production` seeded users are flagged `mustChangePassword`.

## Keycloak (optional, `KEYCLOAK_ENABLED=true`)
Built-in cookie auth is unchanged. With the flag on:
- `GET /api/v1/auth/keycloak/config` → `{enabled, realm, clientId, issuer, ...}`.
- `POST /api/v1/auth/keycloak/login {email,password}` → password grant to Keycloak over `KEYCLOAK_INTERNAL_URL`, token verified, user upserted, then the app's own HttpOnly cookies are set (same-origin frontend flow).
- `Authorization: Bearer <keycloak access token>` works on every route. Only non-HS256 tokens take this path (and only when no `access_token` cookie is present); the app's own HS256 tokens still go through passport.
- **Split-horizon:** signing keys are fetched from `KEYCLOAK_INTERNAL_URL/realms/<realm>/protocol/openid-connect/certs`; the accepted `iss` is `KEYCLOAK_PUBLIC_ISSUER` (and the internal issuer). `azp` must be `royalknot-web` or `royalknot-api`.
- Roles: `FOUNDER`→Admin, `WEDDING_PLANNER`→Planner, `EVENT_MANAGER`→Event Manager, `FINANCE_MANAGER`→Finance, `OPS_STAFF`→Operations (legacy names `founder_admin`, `operations_staff` also accepted). Highest privilege wins. A token with no mapped role gets 403. The local user is matched by **email** (so seeded users keep their ids), created on first sight (id = token `sub`), and its role follows Keycloak on every request.
- With the flag off the two endpoints are 404 and an RS256 bearer token gets a plain 401.
- Keycloak's admin API ignores a supplied user `id`; only a realm *import* honours fixed ids.

## Health, system status, UPI
- `GET /api/v1/health` (readiness): flat `checks` for database, redis, minio, gotenberg, keycloak (`up`/`down`, or `disabled` when the flag is off). 503 only if the database is down; other failures give `degraded`.
- `GET /api/v1/system/status` (public): per-service `{status, latencyMs}`, version, uptime.
- `GET /api/v1/payments/upi-qr?milestoneId=` (finance-read roles): `upi://pay?...` link for the milestone's outstanding amount; no external call.

## Architecture
```
src/
  main.ts · app.module.ts            global prefix, helmet, cookies, CORS, validation, Swagger
  common/                            guards (JWT, roles, origin), filters, interceptors, finance math (pure), PDF/MinIO services
  database/ websocket/ jobs/ health/
  modules/ auth users enquiries weddings agreements vendors quotations tasks events guests
           payments expenses reconciliation analytics documents notifications audit
prisma/ schema.prisma · migrations/ · seed.ts
docs/ER.md                           entity-relationship plan
```
Controllers only validate/authorise; business rules live in services; money rules are pure functions in `common/finance.ts` (unit-tested).

### Key business rules (all verified by tests)
- **Auth**: argon2id, 15-min JWT in HttpOnly cookie, 7-day opaque refresh token with rotation; reuse of a rotated token revokes the whole family. Disabled accounts lose access on the next request. Login/change-password are rate-limited.
- **RBAC**: `@Roles()` on handlers; ADMIN always passes. Matrix: `GET /users/permissions`.
- **Quotations**: server recomputes every total from line items (excluded lines never priced). Comparison flags *lowest*, *best value* (cost per included line, capacity-compliant) and *recommended* (weighted score) — the cheapest is not automatically recommended. Selection is one transaction that locks the RFQ group; a partial unique index guarantees one ACCEPTED request per RFQ.
- **Planning**: booking payment → idempotent generation of 33 (full) / 27 (day-of) tasks. `(weddingId, templateKey)` is unique, so repeats and parallel triggers create nothing new. Dependencies block completion.
- **Client payments**: three staged milestones (20 % booking / 40 % advance / remainder final). Milestone row is locked per payment; `idempotencyKey` is unique; over-payment is rejected; status is computed live (Upcoming/Due/Partially Paid/Paid/Overdue).
- **Extra guests**: `actualGuests − expectedGuests` × the caterer's contracted per-plate rate (400→460 × ₹1,200 = ₹72,000) is created automatically and kept in sync; it counts toward client billing only once Finance approves it, and then lifts the FINAL milestone.
- **Vendor settlement**: remaining = final bill − all payments; final bill = actual invoice (if entered) else negotiated + approved extras. Settling locks the vendor row and recomputes inside the lock, so repeated or parallel settles pay once.
- **Real time**: every mutation saves to PostgreSQL (and the audit log) first, then broadcasts the saved row. Namespace `/live`; handshake is authenticated and Origin-checked; client emits `join {weddingId}` (ack returns `serverTime`) and should re-join + refetch `GET /weddings/:id/event` after reconnect. Events: `vendor.arrival`, `timeline.updated`, `incident.created`, `incident.updated`, `task.updated`, `guests.updated`, `event.status`, `notification`.
- **Jobs (BullMQ)**: reminder scan every 10 min (follow-ups, due/overdue payments, overdue tasks; dedupe keys make it idempotent), email queue (SMTP/Mailpit), report generation (`POST /reports/generate`, poll `GET /reports/jobs/:id`).

## Tests
```bash
npm test            # 42 unit tests: money math, rounding, milestone states, settlement, ranking, CSV, templates
npm run test:e2e    # 52 supertest + socket.io-client tests against the real stack (Postgres, Redis, MinIO, Gotenberg)
```
The e2e suite creates and deletes its own records. It needs the infra containers and a seeded database.

## Backup / restore (summary — see ../DEPLOYMENT.md)
`pg_dump -Fc` for PostgreSQL and `mc mirror` (or a volume copy) for the MinIO bucket; scripts live in `../deploy/scripts/`.
