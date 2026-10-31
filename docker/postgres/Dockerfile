# Postgres with multi-database initialization for The Royal Knot
FROM postgres:16-alpine
COPY init-databases.sh /docker-entrypoint-initdb.d/01-init-databases.sh
COPY init-databases.sql /docker-entrypoint-initdb.d/02-init-databases.sql
RUN chmod 755 /docker-entrypoint-initdb.d/01-init-databases.sh
