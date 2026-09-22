-- Local/CI bootstrap only. These are disposable example passwords, not deployment secrets.
-- Idempotent role creation permits applying this file to an existing local volume.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'gs_owner') THEN
    CREATE ROLE gs_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD 'local-owner-only';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'gs_app') THEN
    CREATE ROLE gs_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD 'local-app-only';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'gs_admin') THEN
    CREATE ROLE gs_admin LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS PASSWORD 'local-admin-only';
  END IF;
END $$;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO gs_owner;
GRANT USAGE ON SCHEMA public TO gs_app, gs_admin;
