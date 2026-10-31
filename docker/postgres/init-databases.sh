#!/bin/sh
# Runs once, on first boot of an empty data directory (docker-entrypoint-initdb.d).
# One Postgres, three isolated databases. Idempotent: safe to re-run by hand.
#   royalknot   - Prisma (created by the image via POSTGRES_DB)
#   keycloak    - Keycloak 26 (keeps its ~90 tables out of Prisma migrations)
#   hyperswitch - optional payments router (profile `payments`)
set -eu

for db in royalknot keycloak hyperswitch; do
  exists=$(psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$db'")
  if [ "$exists" != "1" ]; then
    echo "[init-databases] creating database $db"
    psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE \"$db\" OWNER \"$POSTGRES_USER\""
  fi
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE \"$db\" TO \"$POSTGRES_USER\""
done
