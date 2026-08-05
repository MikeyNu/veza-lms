-- Local-development service identities. Production credentials must be generated
-- and stored by the deployment secret manager; these passwords are intentionally
-- development-only and must never be reused outside a local workstation.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'veza_migrator') THEN
    CREATE ROLE veza_migrator LOGIN PASSWORD 'veza_migrator';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'veza_app') THEN
    CREATE ROLE veza_app LOGIN PASSWORD 'veza_app' NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'veza_control') THEN
    CREATE ROLE veza_control LOGIN PASSWORD 'veza_control' BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'veza_worker') THEN
    CREATE ROLE veza_worker LOGIN PASSWORD 'veza_worker' BYPASSRLS;
  END IF;
END
$$;

ALTER ROLE veza_migrator PASSWORD 'veza_migrator';
ALTER ROLE veza_app PASSWORD 'veza_app' NOBYPASSRLS;
ALTER ROLE veza_control PASSWORD 'veza_control' BYPASSRLS;
ALTER ROLE veza_worker PASSWORD 'veza_worker' BYPASSRLS;

GRANT CONNECT ON DATABASE veza TO veza_migrator, veza_app, veza_control, veza_worker;
GRANT CREATE ON DATABASE veza TO veza_migrator;
GRANT USAGE, CREATE ON SCHEMA public TO veza_migrator;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
