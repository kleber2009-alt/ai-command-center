-- Run once on infra-postgres-1 to bootstrap the persona_studio database.
-- Safe to re-run (IF NOT EXISTS / DO $$ guards throughout).
--
--   docker exec infra-postgres-1 \
--     psql -U postgres -f /tmp/init.sql

-- 1. Create database (must be outside a transaction block)
SELECT 'CREATE DATABASE persona_studio'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'persona_studio')
\gexec

-- 2. Create application role
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'persona') THEN
    CREATE ROLE persona LOGIN PASSWORD 'CHANGE_ME';
  END IF;
END
$$;

-- 3. Grant ownership
\c persona_studio
GRANT ALL PRIVILEGES ON DATABASE persona_studio TO persona;
ALTER SCHEMA public OWNER TO persona;
