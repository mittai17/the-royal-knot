#!/usr/bin/env bash
# Backs up Postgres (pg_dump) and the MinIO data volume into ./backups/<timestamp>/.
# Usage: PROJECT=<compose project> deploy/scripts/backup.sh
# Under Dokploy the compose project is the app name (e.g. compose-xxxx-xxxx-xxxxxx, see Dokploy -> Compose -> General -> App Name
# or `docker ps --format {{.Names}}`); for a plain `docker compose` run it is the directory/-p name.
set -euo pipefail
PROJECT="${PROJECT:-royalknot}"
DEST="${BACKUP_DIR:-./backups}/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$DEST"
PG=$(docker ps --filter "label=com.docker.compose.project=$PROJECT" --filter "label=com.docker.compose.service=postgres" -q | head -1)
[ -n "$PG" ] || { echo "postgres container for project '$PROJECT' not found (set PROJECT=...)" >&2; exit 1; }
docker exec "$PG" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "$DEST/postgres.dump"
VOL=$(docker volume ls -q | grep -E "(^|_)${PROJECT}_miniodata$|^${PROJECT}_miniodata$" | head -1 || true)
if [ -n "$VOL" ]; then
  docker run --rm -v "$VOL":/data:ro -v "$(cd "$DEST" && pwd)":/out alpine tar czf /out/minio-data.tar.gz -C /data .
else
  echo "warning: minio volume not found, skipped" >&2
fi
echo "Backup written to $DEST"; ls -lh "$DEST"
