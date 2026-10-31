-- Single Postgres, 3 Isolated Databases for The Royal Knot:
-- 1. royalknot   (Primary Prisma database for The Royal Knot)
-- 2. keycloak    (Dedicated database for Keycloak 26)
-- 3. hyperswitch (Dedicated database for Juspay Hyperswitch payment router)

SELECT 'CREATE DATABASE royalknot' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'royalknot')\gexec
SELECT 'CREATE DATABASE keycloak' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'keycloak')\gexec
SELECT 'CREATE DATABASE hyperswitch' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'hyperswitch')\gexec

GRANT ALL PRIVILEGES ON DATABASE royalknot TO CURRENT_USER;
GRANT ALL PRIVILEGES ON DATABASE keycloak TO CURRENT_USER;
GRANT ALL PRIVILEGES ON DATABASE hyperswitch TO CURRENT_USER;
