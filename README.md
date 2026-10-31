# The Royal Knot — Wedding Management & Operations Platform

Self-hosted platform for a luxury wedding planning agency: enquiries → agreements → vendor quotations →
planning tasks → live event command centre → payments, reconciliation and profitability.

## Architecture
Next.js (App Router) frontend → rewrites `/api` and `/socket.io` → NestJS REST + Socket.IO backend →
PostgreSQL (Prisma), Redis (BullMQ), MinIO (files), Gotenberg (PDF), Mailpit (local SMTP).
Deployed as one Docker Compose project through Dokploy. See `DEPLOYMENT.md`.

## Stack
Next.js, React, TypeScript, Tailwind, shadcn/ui, Recharts · NestJS, Prisma, Passport/JWT/Argon2, Socket.IO, BullMQ · PostgreSQL 16, Redis 7, MinIO, Gotenberg 8, Mailpit.

## Local development
```bash
docker compose -f docker-compose.infra.yml up -d
cd backend && cp ../.env.example .env   # adjust for localhost URLs
npx prisma migrate dev && npm run seed && npm run start:dev
cd ../frontend && npm run dev
```

## Environment variables
See `.env.example` (deployment) and `backend/` docs for the full list.

## Migrations / seed
`npm run migrate:deploy` (prod) · `npm run migrate:dev` (dev) · `npm run seed` (demo data; in containers set `SEED_ON_START=true` once).

## Docker Compose
`docker-compose.yml` (production, used by Dokploy) · `docker-compose.infra.yml` (dev infra only).

## Backup / restore
`deploy/scripts/backup.sh`, `deploy/scripts/restore.sh` — details in `DEPLOYMENT.md`.

## Demo credentials
_Documented by the backend seed (see `backend/` docs). Development-only; change before any real deployment._

## Status
See `PROJECT_STATUS.md`.
