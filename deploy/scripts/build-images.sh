#!/usr/bin/env bash
# Fast, mostly-offline image build for the split Dokploy layout.
# Builds backend + frontend ON THE HOST (warm npm cache), then packs the artifacts into thin images:
#   royalknot-backend:local   royalknot-frontend:local
# plus (only if missing, or with --all) the helper images referenced by deploy/dokploy-split/*.yml:
#   royalknot-postgres:local  royalknot-keycloak:local  (royalknot-minio:local / royalknot-mc:local are only
#   built with --all because they compile MinIO from source and need the network)
#
# Usage: deploy/scripts/build-images.sh [--all] [--skip-build] [--only backend|frontend]
# Env (frontend build args, defaults for *.royalknot.localhost over HTTP):
#   PUBLIC_DOMAIN=royalknot.localhost  SCHEME=http  NEXT_PUBLIC_DEMO_MODE=true
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STAGE="$ROOT/deploy/.build"
CACHE="$ROOT/deploy/.cache"
PUBLIC_DOMAIN="${PUBLIC_DOMAIN:-royalknot.localhost}"
SCHEME="${SCHEME:-http}"
TAG="${IMAGE_TAG:-local}"
ALL=0; SKIP_BUILD=0; ONLY=""
while [ $# -gt 0 ]; do case "$1" in
  --all) ALL=1;; --skip-build) SKIP_BUILD=1;; --only) ONLY="$2"; shift;;
  *) echo "unknown arg $1"; exit 2;; esac; shift; done
want() { [ -z "$ONLY" ] || [ "$ONLY" = "$1" ]; }
T0=$(date +%s); lap() { echo "[build-images] $1 (+$(( $(date +%s) - T0 ))s)"; }
export npm_config_prefer_offline=true npm_config_audit=false npm_config_fund=false
mkdir -p "$STAGE" "$CACHE"

# ---- base image (node:22-alpine + openssl + curl), built once -------------------------------------
if ! docker image inspect royalknot-node-base:$TAG >/dev/null 2>&1; then
  lap "building royalknot-node-base:$TAG (one-off apk add)"
  printf 'FROM node:22-alpine\nRUN apk add --no-cache openssl curl\n' | docker build -q -t royalknot-node-base:$TAG -
fi

# ---- backend ---------------------------------------------------------------------------------------
if want backend; then
  cd "$ROOT/backend"
  [ -d node_modules ] || { lap "backend: npm ci (cache)"; npm ci --prefer-offline; }
  if [ $SKIP_BUILD -eq 0 ]; then lap "backend: npm run build"; npm run build; fi

  # Prisma musl engines (alpine). Not produced by a glibc host; reuse cached copy, or lift them from an
  # image that already has them, or download via prisma (needs binaries.prisma.sh, not the npm registry).
  M="$CACHE/prisma-musl"
  if [ ! -f "$M/libquery_engine-linux-musl-openssl-3.0.x.so.node" ] || [ ! -f "$M/schema-engine-linux-musl-openssl-3.0.x" ]; then
    mkdir -p "$M"
    for img in royalknot-backend:$TAG royalknot-backend:test rktest-backend:latest; do
      if docker image inspect "$img" >/dev/null 2>&1; then
        lap "extracting musl prisma engines from $img"
        c=$(docker create "$img")
        docker cp "$c:/app/node_modules/@prisma/engines/libquery_engine-linux-musl-openssl-3.0.x.so.node" "$M/" || true
        docker cp "$c:/app/node_modules/@prisma/engines/schema-engine-linux-musl-openssl-3.0.x" "$M/" || true
        docker rm "$c" >/dev/null
        [ -f "$M/schema-engine-linux-musl-openssl-3.0.x" ] && break
      fi
    done
  fi
  if [ ! -f "$M/schema-engine-linux-musl-openssl-3.0.x" ]; then
    lap "downloading musl prisma engines"
    PRISMA_CLI_BINARY_TARGETS=linux-musl-openssl-3.0.x PRISMA_QUERY_ENGINE_LIBRARY= \
      PRISMA_ENGINES_MIRROR="${PRISMA_ENGINES_MIRROR:-https://binaries.prisma.sh}" \
      npx prisma generate >/dev/null
    cp node_modules/.prisma/client/libquery_engine-linux-musl-openssl-3.0.x.so.node "$M/"
    cp node_modules/@prisma/engines/schema-engine-linux-musl-openssl-3.0.x "$M/" 2>/dev/null \
      || echo "WARN: musl schema-engine missing; 'prisma migrate deploy' will try to download it at runtime"
  fi

  lap "backend: staging"
  B="$STAGE/backend"; rm -rf "$B"; mkdir -p "$B"
  cp -a dist prisma package.json docker-entrypoint.sh "$B/"
  cp -a tsconfig*.json "$B/"
  # node_modules: hardlink copy (fast, no extra disk). Prod+prisma only would need the registry; the
  # full tree is already on disk. argon2/msgpackr ship musl prebuilds so they work on alpine as-is.
  cp -al node_modules "$B/node_modules"
  for d in "$B/node_modules/.prisma/client" "$B/node_modules/@prisma/engines"; do
    # hardlinked dirs: copy files in (adding new names does not touch the host tree)
    cp --remove-destination "$M"/* "$d/" 2>/dev/null || true
  done
  chmod +x "$B/node_modules/@prisma/engines/schema-engine-linux-musl-openssl-3.0.x" 2>/dev/null || true
  cp "$ROOT/backend/Dockerfile.prebuilt" "$B/Dockerfile"
  lap "backend: docker build"
  docker build -q --build-arg BASE=royalknot-node-base:$TAG -t royalknot-backend:$TAG "$B"
fi

# ---- frontend --------------------------------------------------------------------------------------
if want frontend; then
  [ -d "$ROOT/frontend/node_modules" ] || { (cd "$ROOT/frontend" && lap "frontend: npm ci (cache)" && npm ci --prefer-offline); }
  # Build from a private snapshot so a running `next dev` / other build never clobbers .next mid-build.
  SRC="$STAGE/frontend-src"; mkdir -p "$SRC"
  rsync -a --delete --exclude node_modules --exclude .next --exclude e2e --exclude test-results --exclude shots \
    --exclude '*.tsbuildinfo' "$ROOT/frontend/" "$SRC/"
  # next/font/google downloads fonts at build time: seed the snapshot with the host's .next/cache (fonts + webpack)
  if [ ! -d "$SRC/.next/cache" ] && [ -d "$ROOT/frontend/.next/cache" ]; then mkdir -p "$SRC/.next"; cp -a "$ROOT/frontend/.next/cache" "$SRC/.next/cache"; fi
  # hardlink copy (a symlink breaks Next's standalone file tracing)
  rm -rf "$SRC/node_modules"; cp -al "$ROOT/frontend/node_modules" "$SRC/node_modules"
  cd "$SRC"
  if [ $SKIP_BUILD -eq 1 ] && [ ! -d .next/standalone ]; then SRC_NEXT="$ROOT/frontend/.next"; else SRC_NEXT="$SRC/.next"; fi
  if [ $SKIP_BUILD -eq 0 ]; then
    lap "frontend: npm run build"
    BACKEND_URL="http://backend:4000" \
    NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-}" \
    NEXT_PUBLIC_WS_URL="${NEXT_PUBLIC_WS_URL:-}" \
    NEXT_PUBLIC_KEYCLOAK_URL="${NEXT_PUBLIC_KEYCLOAK_URL:-$SCHEME://auth.$PUBLIC_DOMAIN}" \
    NEXT_PUBLIC_KEYCLOAK_REALM="${NEXT_PUBLIC_KEYCLOAK_REALM:-royalknot}" \
    NEXT_PUBLIC_KEYCLOAK_CLIENT_ID="${NEXT_PUBLIC_KEYCLOAK_CLIENT_ID:-royalknot-web}" \
    NEXT_PUBLIC_DEMO_MODE="${NEXT_PUBLIC_DEMO_MODE:-true}" \
    NEXT_TELEMETRY_DISABLED=1 npm run build
  fi
  lap "frontend: staging"
  F="$STAGE/frontend"; rm -rf "$F"; mkdir -p "$F"
  cp -a "$SRC_NEXT/standalone" "$F/standalone"
  cp -a "$SRC_NEXT/static" "$F/static"
  if [ -d public ]; then cp -a public "$F/public"; else mkdir "$F/public"; fi
  cp "$ROOT/frontend/Dockerfile.prebuilt" "$F/Dockerfile"
  lap "frontend: docker build"
  docker build -q -t royalknot-frontend:$TAG "$F"
fi

# ---- helper images (init scripts / realm baked in because Raw-compose in Dokploy has no repo files) ---
if [ -z "$ONLY" ]; then
  if [ $ALL -eq 1 ] || ! docker image inspect royalknot-postgres:$TAG >/dev/null 2>&1; then
    lap "royalknot-postgres:$TAG"; docker build -q -t royalknot-postgres:$TAG "$ROOT/docker/postgres"; fi
  if [ $ALL -eq 1 ] || ! docker image inspect royalknot-keycloak:$TAG >/dev/null 2>&1; then
    lap "royalknot-keycloak:$TAG"; docker build -q -t royalknot-keycloak:$TAG "$ROOT/docker/keycloak"; fi
  if [ $ALL -eq 1 ] || ! docker image inspect royalknot-minio:$TAG >/dev/null 2>&1; then
    lap "royalknot-minio:$TAG (network)"; docker build -q -t royalknot-minio:$TAG "$ROOT/deploy/minio"; fi
  if [ $ALL -eq 1 ] || ! docker image inspect royalknot-mc:$TAG >/dev/null 2>&1; then
    lap "royalknot-mc:$TAG (network)"; docker build -q -t royalknot-mc:$TAG -f "$ROOT/deploy/minio/Dockerfile.mc" "$ROOT/deploy/minio"; fi
fi
lap "done"
docker images --format '  {{.Repository}}:{{.Tag}}  {{.Size}}' | grep -E 'royalknot-(backend|frontend|postgres|keycloak|minio|mc|node-base):'"$TAG"
