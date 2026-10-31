# Royal Knot - split Dokploy deployment (one Dokploy service per tier)

Instead of one monolithic compose, each tier is its own **Compose service (source: Raw)** in the Dokploy
project `odoo`. They talk over one shared external Docker network, `royalknot-internal`, by service alias
(`postgres`, `redis`, `minio`, `keycloak`, `gotenberg`, `mailpit`, `backend`, `frontend`).
No cross-file `depends_on`; the backend entrypoint waits up to 120 s for postgres, then migrates and seeds.
The existing monolithic `docker-compose.yml` is untouched.

## 0. One-time host prep (no network-heavy work inside Docker)

```bash
docker network create royalknot-internal        # shared by all services (dokploy-network already exists)
deploy/scripts/build-images.sh                   # builds on the host, packs thin images, ~30-60 s warm
```

`build-images.sh` produces `royalknot-backend:local`, `royalknot-frontend:local`, plus (only if missing)
`royalknot-postgres:local` (init scripts baked in), `royalknot-keycloak:local` (realm import baked in),
`royalknot-minio:local` and `royalknot-mc:local` (these two compile MinIO from source = network; they already
exist locally; `--all` forces a rebuild). Raw compose in Dokploy has no access to repo files, which is why
init scripts and the realm are baked into images instead of bind-mounted.

Flags: `--only backend|frontend`, `--skip-build` (reuse existing dist/.next), `--all`.
Env: `PUBLIC_DOMAIN` (default `royalknot.localhost`), `SCHEME` (default `http`), `NEXT_PUBLIC_DEMO_MODE`.
Frontend `NEXT_PUBLIC_*` and `BACKEND_URL=http://backend:4000` are baked at build time, so rebuild the
frontend image when the public domains change.

Measured on this machine (warm npm cache): backend ~26 s, frontend ~32 s (15 s with warm snapshot cache),
full first run ~52 s including helper images. Prerequisites that still touch the network, once:
`apk add openssl curl` for the `royalknot-node-base:local` base (about 45 s), and `next/font/google`
fonts (cached in `.next/cache`; the script seeds its private build snapshot from `frontend/.next/cache`).

### Prisma engines on alpine
`backend/prisma/schema.prisma` has no `binaryTargets`, so a host `prisma generate` only yields the
`debian-openssl-3.0.x` engine. The script therefore injects the musl engines
(`libquery_engine-linux-musl-openssl-3.0.x.so.node`, `schema-engine-linux-musl-openssl-3.0.x`) into the staged
`node_modules`, taking them from `deploy/.cache/prisma-musl/` (populated from an existing
`royalknot-backend:*` image, or downloaded from binaries.prisma.sh as a fallback). Verified: backend reports
`database: up` and runs `migrate deploy` + seed on alpine.
Note for the foundation agent (optional, makes this self-healing): add
`binaryTargets = ["native", "linux-musl-openssl-3.0.x"]` to the generator in `schema.prisma`.

## 1. Create the Dokploy services (project `odoo`)

For each row: Create Service -> Compose -> Source type **Raw** -> paste the file -> Environment tab: paste
`env/<name>.env.example` with real values -> Deploy. **Deploy in this order**, waiting for healthy:

| # | Service name | Compose file | Env file | Domains (Domains tab; HTTP, no cert, host/port/path) |
|---|---|---|---|---|
| 1 | `royalknot-data` | `data.yml` | `env/data.env.example` | none |
| 2 | `royalknot-tools` | `tools.yml` | `env/tools.env.example` | `mail.royalknot.localhost` -> service `mailpit`, port 8025 |
| 3 | `royalknot-identity` | `identity.yml` | `env/identity.env.example` | `auth.royalknot.localhost` -> service `keycloak`, port 8080 |
| 4 | `royalknot-backend` | `backend.yml` | `env/backend.env.example` | `api.royalknot.localhost` -> service `backend`, port 4000 |
| 5 | `royalknot-frontend` | `frontend.yml` | `env/frontend.env.example` | `app.royalknot.localhost` -> service `frontend`, port 3000 |

Domain settings for all: HTTPS off, certificate type `none`, path `/`. `*.localhost` resolves to 127.0.0.1
in browsers; Traefik listens on port 80. Do not enable "Isolated Deployment" (it would rename networks);
the compose files already join `dokploy-network` (public services) and `royalknot-internal` (all).

Secrets must agree across services: `POSTGRES_PASSWORD` (data, identity, backend), `MINIO_ROOT_PASSWORD`
(data, backend), `KC_API_CLIENT_SECRET` (identity, backend). Generate JWT secrets with `openssl rand -hex 32`.
Public URLs: `PUBLIC_APP_URL=http://app.royalknot.localhost`, `KEYCLOAK_PUBLIC_URL=http://auth.royalknot.localhost`,
`COOKIE_SECURE=false` (plain HTTP).

## 2. Redeploying after code changes
```bash
deploy/scripts/build-images.sh --only backend     # or frontend
```
then click **Deploy** (or Rebuild/Redeploy) on that Dokploy service; it recreates the container from the new
`:local` image. Data tier is never touched.

## 3. Local test without Dokploy (what was verified)
```bash
docker network create royalknot-internal
for f in data tools identity backend frontend; do
  docker compose -p rk-$f --env-file my.env -f deploy/dokploy-split/$f.yml up -d; done
# ... check, then:
for f in frontend backend identity tools data; do docker compose -p rk-$f --env-file my.env -f deploy/dokploy-split/$f.yml down -v; done
docker network rm royalknot-internal
```
Nothing publishes host ports; check from inside: `docker exec <backend> curl -s localhost:4000/api/v1/health`.

## Troubleshooting
- `network royalknot-internal declared as external, but could not be found`: run the `docker network create` above.
- Frontend `/api/*` returns 500 `Failed to proxy http://localhost:4000`: image was built without
  `BACKEND_URL`; rebuild with `build-images.sh --only frontend` (script sets it).
- Keycloak health stays unhealthy: the data service must be healthy first (keycloak DB lives in `postgres`).
- Image optimisation (`next/image`) uses the host glibc `sharp`; irrelevant unless remote images are optimised.
