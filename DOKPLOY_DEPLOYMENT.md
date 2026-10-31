# Deploying The Royal Knot on Dokploy (Production Guide)

This guide walks through deploying **The Royal Knot** as a single **Docker Compose Service inside Dokploy** (`Create Service -> Compose`).

---

## Architecture Overview

```
                      Internet (Public HTTPS)
                                 │
                     ┌───────────▼───────────┐
                     │ Dokploy Traefik Proxy │ (dokploy-network)
                     └─────┬───────┬───────┬─┘
                           │       │       │
      ┌────────────────────┘       │       └────────────────────┐
      │ https://app.<domain>       │ https://api.<domain>       │ https://auth.<domain>
      ▼                            ▼                            ▼
┌─────────────┐             ┌─────────────┐             ┌─────────────┐
│  frontend   │             │   backend   │             │  keycloak   │
│  (Next.js)  │             │  (NestJS)   │             │ (Keycloak)  │
│  Port 3000  │             │  Port 4000  │             │  Port 8080  │
└──────┬──────┘             └──────┬──────┘             └──────┬──────┘
       │                           │                           │
═══════╪═══════════════════════════╪═══════════════════════════╪═══════
       │          Internal Docker Network (`royalknot-internal`)│
       │                           │                           │
       ├───────────────────────────┼───────────────────────────┤
       │                           │                           │
┌──────▼──────┐             ┌──────▼──────┐             ┌──────▼──────┐
│  postgres   │             │    redis    │             │    minio    │
│ (PostgreSQL)│             │ (BullMQ/KV) │             │ (S3 Storage)│
│  Port 5432  │             │  Port 6379  │             │  Port 9000  │
└─────────────┘             └─────────────┘             └─────────────┘
       │                           │                           │
┌──────▼──────┐             ┌──────▼──────┐             ┌──────▼──────┐
│  gotenberg  │             │   mailpit   │             │ hyperswitch │
│ (Chromium)  │             │ (SMTP/Web)  │             │  (Payments) │
│  Port 3000  │             │ 1025 / 8025 │             │  Port 8080  │
└─────────────┘             └─────────────┘             └─────────────┘
```

- **Dual-Network Isolation:**
  - `dokploy-network`: External Docker overlay network managed by Dokploy Traefik. Only public services (`frontend`, `backend`, `keycloak`, `hyperswitch`, `mailpit`) are attached.
  - `royalknot-internal`: Private bridge network. All 11 containers communicate securely via internal DNS (`http://backend:4000`, `http://keycloak:8080`, `http://gotenberg:3000`, `http://minio:9000`, `http://hyperswitch:8080`, `http://mailpit:1025`).
- **Zero Host Port Conflicts:** All container ports use `expose:`. Dokploy's Traefik dynamically routes inbound domain traffic.
- **Resource Protection:**
  - Keycloak: Heap constrained (`-Xms256m -Xmx512m`)
  - Gotenberg: `shm_size: 256mb` and `--api-timeout=30s`
  - Redis: Maxmemory 256MB with `noeviction` policy for BullMQ safety.

---

## Step 1: Create the Project & Service in Dokploy

1. Log into your Dokploy dashboard: `http://<your-vps-ip>:3000` (or `https://dokploy.<your-domain>`).
2. Click **Create Project** in the left sidebar.
3. Enter Project Name: `The Royal Knot` and click **Create**.
4. Inside the project, click **Create Service** and select **Compose**.
5. Set the Service Name: `royalknot`.

---

## Step 2: Configure Compose Settings

1. In the **General** tab of the newly created compose service:
   - **Compose Type:** Select `Docker Compose`.
   - **Source Type:** Select `Git` (or `Raw` if pasting YAML directly).
   - If using `Git`:
     - **Repository URL:** Your repository URL (e.g., `https://github.com/your-org/the-royal-knot.git`).
     - **Branch:** `main`.
     - **Compose Path:** `./docker-compose.yml`.
   - Ensure **Isolated Deployment** is toggled **OFF** (the stack explicitly declares and joins the external `dokploy-network`).

---

## Step 3: Configure Environment Variables

1. Navigate to the **Environment** tab in your Dokploy compose service.
2. Open `.env.dokploy.example` from the repository.
3. Copy all variables and paste them into the Dokploy Environment editor.
4. Replace placeholder secrets:
   ```bash
   # Generate strong secrets for production:
   openssl rand -hex 32
   ```
   Key variables to update:
   - `BASE_DOMAIN`: Your root domain (e.g., `royalknot.in`).
   - `PUBLIC_APP_URL`: `https://app.royalknot.in`.
   - `KEYCLOAK_PUBLIC_URL`: `https://auth.royalknot.in`.
   - `COOKIE_SECURE`: `true`.
   - `TRAEFIK_ENTRYPOINT`: `websecure`.
   - `POSTGRES_PASSWORD`: Strong database password.
   - `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`: 64-character random hex strings.
   - `MINIO_ROOT_PASSWORD`: MinIO secret key.
   - `KEYCLOAK_ADMIN_PASSWORD`: Keycloak master admin password.
   - `KC_API_CLIENT_SECRET`: Secret matching Keycloak API client.
5. Click **Save**.

---

## Step 4: Map Public Domains in Dokploy Domains Tab

Navigate to the **Domains** tab in your Dokploy compose service. Add the following 4 domain routes:

| Host / Subdomain | Service Name | Internal Port | HTTPS / SSL | Certificate Resolver | WebSocket Support |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `app.${BASE_DOMAIN}` | `frontend` | `3000` | Enabled (HTTPS) | Let's Encrypt | Enabled |
| `api.${BASE_DOMAIN}` | `backend` | `4000` | Enabled (HTTPS) | Let's Encrypt | Enabled |
| `auth.${BASE_DOMAIN}` | `keycloak` | `8080` | Enabled (HTTPS) | Let's Encrypt | Enabled |
| `mail.${BASE_DOMAIN}` | `mailpit` | `8025` | Enabled (HTTPS) | Let's Encrypt | Disabled |

> [!NOTE]
> Make sure your DNS provider has `A` records for `app.`, `api.`, `auth.`, and `mail.` pointing to your Dokploy VPS IP address before issuing Let's Encrypt certificates.

---

## Step 5: Deploy the Stack

1. Click **Deploy** in the top-right corner of the Dokploy service page.
2. Dokploy will:
   - Build `postgres` (running `/docker-entrypoint-initdb.d/01-init-databases.sh` to initialize `royalknot`, `keycloak`, and `hyperswitch` databases).
   - Start `redis`, `gotenberg`, `mailpit`, and `minio`.
   - Run `minio-init` to provision the private bucket `royalknot-documents`.
   - Build and start `keycloak:26.0` with `--import-realm --optimized`, importing the 5 pre-seeded demo users and roles.
   - Build and start `backend`:
     - Waits for PostgreSQL readiness on port `5432`.
     - Automatically runs `npx prisma migrate deploy`.
     - Automatically seeds the database idempotently (`npx prisma db seed`).
     - Serves the NestJS API and healthcheck at `/api/v1/health`.
   - Build and start `frontend` (Next.js standalone).
   - Start automated `db-backup` cron service.

---

## Step 6: Verification & System Status Check

1. Open your browser and navigate to:
   ```
   https://app.${BASE_DOMAIN}/system-status
   ```
2. Verify that all services display **Operational** (green badges):
   - **Database (PostgreSQL):** Operational
   - **Redis (BullMQ & Cache):** Operational
   - **MinIO (Object Storage):** Operational
   - **Gotenberg (Chromium PDF Generator):** Operational
   - **Keycloak (Identity Provider):** Operational

3. Open the login page:
   ```
   https://app.${BASE_DOMAIN}/login
   ```
4. Test the **1-Click Demo Role Switcher**:
   - Click any role button (`Founder`, `Wedding Planner`, `Event Manager`, `Finance Manager`, `Operations Staff`) to instantly authenticate via Keycloak and explore The Royal Knot dashboard!

---

## Pre-Configured Demo Credentials

| Role | Email | Password | Keycloak Static UUID |
| :--- | :--- | :--- | :--- |
| **Founder / Admin** | `arjun@royalknot.in` | `RoyalKnot@2026` | `11111111-1111-1111-1111-111111111111` |
| **Wedding Planner** | `priya@royalknot.in` | `RoyalKnot@2026` | `22222222-2222-2222-2222-222222222222` |
| **Event Manager** | `kabir@royalknot.in` | `RoyalKnot@2026` | `33333333-3333-3333-3333-333333333333` |
| **Finance Manager** | `meera@royalknot.in` | `RoyalKnot@2026` | `44444444-4444-4444-4444-444444444444` |
| **Operations Staff** | `rohan@royalknot.in` | `RoyalKnot@2026` | `55555555-5555-5555-5555-555555555555` |
