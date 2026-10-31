# Deploying The Royal Knot with Dokploy

Dokploy is the deployment manager only; end users never see it. The app is one Docker Compose project
(`docker-compose.yml`): frontend, backend, postgres, redis, minio, gotenberg, mailpit.

## A. Initial setup — INTERNET REQUIRED (one time)

Dokploy's installer and every image pull need internet access. Do this section while online.

1. **Install Dokploy** on a Linux host with ports 80, 443, 3000 free:
   ```bash
   curl -sSL https://dokploy.com/install.sh -o dokploy-install.sh   # read it first
   sudo ADVERTISE_ADDR=<host-private-ip> bash dokploy-install.sh
   ```
   This initialises Docker Swarm, creates the `dokploy-network` overlay, and starts `dokploy`,
   `dokploy-postgres` and `dokploy-traefik`. Panel: `http://<host-ip>:3000`.
2. Create the admin account at the panel's first-run page.
3. **Create a project** (e.g. "Royal Knot") → **Create Service → Compose**.
4. **Source** — two supported ways:
   - **Git** (preferred when you have a Git remote Dokploy can reach, e.g. self-hosted Gitea): Compose path
     `./docker-compose.yml`; Dokploy builds the images from the repo. *Not tested here.*
   - **Raw + prebuilt images** (tested; no Git needed): on the Docker host run `docker compose build`, then
     `python3 deploy/scripts/make-image-only-compose.py` and paste `deploy/docker-compose.images.yml` into a
     **Raw** compose service. Raw services have no source tree, so the images must already exist on the host
     (they are tagged `royalknot-backend:local`, `royalknot-frontend:local`, `royalknot-minio:local`).
   Compose type: **Docker Compose**. Turn **Isolated Deployment** off (the file already joins `dokploy-network`).
5. **Environment tab**: paste `.env.example` and replace every `change-me` with output of `openssl rand -hex 32`.
   - `APP_DOMAIN` — hostname that resolves to the Dokploy host.
   - Plain HTTP / LAN: `TRAEFIK_ENTRYPOINT=web`, `COOKIE_SECURE=false`, `PUBLIC_URL=http://<APP_DOMAIN>`. `*.localhost` names resolve to the local host in browsers, so `APP_DOMAIN=royalknot.localhost` needs no DNS.
   - HTTPS: `TRAEFIK_ENTRYPOINT=websecure`, `COOKIE_SECURE=true`. Add a certificate resolver label
     (`traefik.http.routers.royalknot.tls.certresolver=letsencrypt`) or use Dokploy's Domains tab.
   - First deploy only: `SEED_ON_START=true`, then set it back to `false` and redeploy.
6. **Deploy**. The backend waits for postgres/redis/minio, runs `prisma migrate deploy`
   (or `db push` when no migrations exist yet), optionally seeds, then serves `/api/v1/health`.
7. Open `http://<APP_DOMAIN>`. Demo credentials: see `README.md`.

Only the frontend is routed publicly. The browser calls `/api/*` and `/socket.io/*` on the frontend,
which rewrites to `http://backend:4000` inside the private `internal` network. Postgres, Redis and MinIO
publish **no** ports. `next.config.mjs` must keep `output: 'standalone'` (it does) and its rewrite
destination is baked at build time from the `BACKEND_URL` build arg.

## B. Offline / private-network operation

Once images exist on the host, the running system needs no internet: auth, DB, storage, PDFs
(Gotenberg) and mail (Mailpit) are all local.

```bash
# online machine
deploy/scripts/offline-save.sh royalknot-images.tar.gz
# also save Dokploy's own images:
docker save dokploy/dokploy:latest postgres:16 traefik:v3.6.25 | gzip > dokploy-images.tar.gz
# offline host
deploy/scripts/offline-load.sh royalknot-images.tar.gz
gunzip -c dokploy-images.tar.gz | docker load
```
Caveats: Dokploy's installer itself still needs internet (docker, image pulls, public-IP lookup unless
`ADVERTISE_ADDR` is set), so install Dokploy online first or replay its steps from the loaded images.
In Dokploy, deploy with the images already present (builds also need npm/Go module access, so build online or ship the built images).
MinIO is built from source because no official image is published anymore — `offline-save.sh` captures the result.

## C. Backup and restore

```bash
deploy/scripts/backup.sh                    # -> backups/<UTC timestamp>/{postgres.dump,minio-data.tar.gz}
deploy/scripts/restore.sh backups/<stamp>   # destructive, asks for confirmation
```
`PROJECT` defaults to `royalknot`; Dokploy may prefix compose project names — override with `PROJECT=<name>`
(`docker ps --format '{{.Label "com.docker.compose.project"}}'`). Schedule backup.sh with cron or a Dokploy schedule job
and copy the output off-host.

## D. Local development
`docker compose -f docker-compose.infra.yml up -d` starts infra on localhost only (5432, 6379, 9000/9001, 3003, 1025/8025);
run backend and frontend with npm. The production compose needs `docker network create dokploy-network` if Dokploy isn't installed.

## E. Verified on this machine (2026-10-31)

- Built with plain `docker compose build`, run as a separate project: migrations (3) applied, seed ran, all 7 services healthy.
- Deployed through Dokploy v0.30.10 as a Raw compose app using `deploy/docker-compose.images.yml`, domain
  `royalknot.localhost`, entrypoint `web`. Through Traefik on port 80: login page 200, `/api/v1/health` shows
  database/redis/minio/gotenberg up, founder login works, 25 weddings returned.
- Socket.IO works through the frontend (Next rewrite) **and** through Traefik with the WebSocket transport: a client joined
  a wedding room and received `incident.created` after an incident was created over the API. No separate `/socket.io`
  Traefik rule is needed.
- File upload to MinIO and download are byte-identical; agreement PDF (1 page) and reconciliation statement PDF (2 pages)
  are produced by Gotenberg.
- `deploy/scripts/backup.sh` + `restore.sh` (need `PROJECT=<compose project name>`; under Dokploy that is the app name):
  deleted a wedding, restored, row came back; MinIO restore verified after restarting minio.
- `deploy/scripts/offline-save.sh` wrote a 1.1 GB tarball of all 7 images; `offline-load.sh` loaded them.
- Dockerfiles run `npm i -g npm@12.2.1` before `npm ci` because the lockfiles come from npm 12 and node:22 ships npm 10.

**Not verified:** Git-sourced Dokploy deploy, HTTPS/Let's Encrypt, a deploy on a second machine, a truly air-gapped run
(Dokploy's own images also need saving, see B), restore while users are active.

---

## Dokploy project `odoo` (verified on this host)

Dokploy project **odoo** (environment `production`) contains two compose apps:

| App | Source | Services | Routes (Traefik, http) |
|---|---|---|---|
| `royalknot` | `docker-compose.yml` / `deploy/docker-compose.images.yml` (raw) | frontend, backend, postgres, redis, minio, gotenberg, mailpit | `royalknot.localhost` (app), `minio.localhost` (MinIO console), `mail.localhost` (Mailpit UI, basic auth via `MAILPIT_UI_AUTH`) |
| `platform` | `deploy/platform/docker-compose.yml` (raw) | keycloak, keycloak-db (dedicated Postgres 16), adminer | `keycloak.localhost`, `adminer.localhost` |

Notes:
- Postgres, Redis and the MinIO S3 API publish **no host ports**; only Traefik-routed UIs are reachable.
- Keycloak 26.4 runs `start --import-realm` against its own database. The imported realm `royalknot` has realm roles `founder_admin`, `wedding_planner`, `event_manager`, `finance_manager`, `operations_staff` (mapping to the app roles ADMIN, PLANNER, EVENT_MANAGER, FINANCE, OPERATIONS) and a public PKCE client `royalknot-web`.
- **Keycloak is optional.** The Royal Knot app keeps its built-in authentication (Argon2 + JWT cookies); it is not wired to Keycloak.
- Adminer joins the `royalknot` internal network, so both `keycloak-db` and the app database (`postgres`) can be opened from it. Override the network name with `ROYALKNOT_INTERNAL_NETWORK` if the Dokploy app name changes.
- Secrets (`KEYCLOAK_ADMIN_PASSWORD`, `KEYCLOAK_DB_PASSWORD`, `MAILPIT_UI_AUTH`) live only in Dokploy's environment for each app; the generated values are in `~/.odoo-stack-credentials` on the host (not in the repo). `*.localhost` resolves to 127.0.0.1 in browsers; on other machines add hosts entries or real DNS.
- Checks run after deploy: all containers healthy; `keycloak.localhost/realms/royalknot` returns 200 and the roles/client exist; `adminer.localhost` 200; `minio.localhost` 200; `mail.localhost` 401 without credentials; `royalknot.localhost/login` 200.
