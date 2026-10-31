#!/usr/bin/env bash
# Restores a backup made by backup.sh. DESTRUCTIVE: replaces the database contents.
# Usage: PROJECT=<compose project> deploy/scripts/restore.sh backups/<timestamp>   (see backup.sh for the project name)
set -euo pipefail
SRC="${1:?usage: restore.sh <backup-dir>}"
PROJECT="${PROJECT:-royalknot}"
read -r -p "Overwrite database and MinIO data of project '$PROJECT' from $SRC? type yes: " ok
[ "$ok" = "yes" ] || exit 1
PG=$(docker ps --filter "label=com.docker.compose.project=$PROJECT" --filter "label=com.docker.compose.service=postgres" -q | head -1)
[ -n "$PG" ] || { echo "postgres container not found" >&2; exit 1; }
docker exec -i "$PG" sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < "$SRC/postgres.dump"
if [ -f "$SRC/minio-data.tar.gz" ]; then
  VOL=$(docker volume ls -q | grep -E "${PROJECT}_miniodata$" | head -1)
  docker run --rm -v "$VOL":/data -v "$(cd "$SRC" && pwd)":/in alpine sh -c 'rm -rf /data/* && tar xzf /in/minio-data.tar.gz -C /data'
  echo "MinIO data restored; restart the minio container."
fi
echo "Restore complete."
