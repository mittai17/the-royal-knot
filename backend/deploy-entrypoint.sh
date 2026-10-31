#!/bin/sh
set -e
if [ -d prisma/migrations ] && [ -n "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  echo "[entrypoint] prisma migrate deploy"
  npx prisma migrate deploy
else
  echo "[entrypoint] no migrations found, using prisma db push"
  npx prisma db push --skip-generate
fi
if [ "$SEED_ON_START" = "true" ]; then
  echo "[entrypoint] seeding demo data"
  npm run seed
fi
exec node dist/main.js
