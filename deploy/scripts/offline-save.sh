#!/usr/bin/env bash
# Run on an internet-connected machine: pulls/builds every image and writes one tarball.
# Usage: deploy/scripts/offline-save.sh [output.tar.gz]
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT="${1:-royalknot-images.tar.gz}"
export POSTGRES_PASSWORD=x JWT_ACCESS_SECRET=x JWT_REFRESH_SECRET=x MINIO_ROOT_PASSWORD=xxxxxxxx
docker network inspect dokploy-network >/dev/null 2>&1 || docker network create dokploy-network >/dev/null
docker compose -f docker-compose.yml pull --ignore-buildable
docker compose -f docker-compose.yml build
IMAGES=$(docker compose -f docker-compose.yml config --images | sort -u)
echo "Saving: $IMAGES"
docker save $IMAGES | gzip > "$OUT"
echo "Wrote $OUT ($(du -h "$OUT" | cut -f1)). Copy it to the offline host and run offline-load.sh."
