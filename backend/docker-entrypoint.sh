#!/bin/sh
# Container start: wait for Postgres -> migrate -> seed -> start the API.
set -e

echo "[entrypoint] waiting for postgres"
node -e '
const u = new URL(process.env.DATABASE_URL);
const net = require("net");
const deadline = Date.now() + 120000;
(function try_() {
  const s = net.connect(+u.port || 5432, u.hostname);
  s.on("connect", () => { s.end(); process.exit(0); });
  s.on("error", () => { s.destroy(); if (Date.now() > deadline) { console.error("postgres not reachable"); process.exit(1); } setTimeout(try_, 1500); });
})();
'

echo "[entrypoint] running database migrations"
if [ -d prisma/migrations ] && [ -n "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  npx prisma migrate deploy
else
  echo "[entrypoint] no migrations directory found, pushing schema"
  npx prisma db push --skip-generate
fi

if [ "${SEED_ON_START:-true}" = "true" ]; then
  echo "[entrypoint] running database seed"
  npx prisma db seed
fi

echo "[entrypoint] starting server"
exec node dist/main.js
