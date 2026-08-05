import pg from "pg";

const { Client } = pg;

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function passwordFromUrl(name) {
  const url = new URL(required(name));
  if (!url.password) throw new Error(`${name} must include a password`);
  return decodeURIComponent(url.password);
}

const bootstrapUrl = required("BOOTSTRAP_DATABASE_URL");
const identities = {
  migrator: passwordFromUrl("MIGRATION_DATABASE_URL"),
  application: passwordFromUrl("DATABASE_URL"),
  control: passwordFromUrl("CONTROL_PLANE_DATABASE_URL"),
  worker: passwordFromUrl("WORKER_DATABASE_URL"),
};

const client = new Client({
  connectionString: bootstrapUrl,
  statement_timeout: 30_000,
  application_name: "veza-production-role-bootstrap",
});

try {
  await client.connect();
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('veza.database-role-bootstrap'))");
  await client.query("SELECT set_config('veza.password.migrator', $1, true)", [identities.migrator]);
  await client.query("SELECT set_config('veza.password.application', $1, true)", [identities.application]);
  await client.query("SELECT set_config('veza.password.control', $1, true)", [identities.control]);
  await client.query("SELECT set_config('veza.password.worker', $1, true)", [identities.worker]);
  await client.query(`
    DO $roles$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'veza_migrator') THEN
        EXECUTE format(
          'CREATE ROLE veza_migrator LOGIN PASSWORD %L',
          current_setting('veza.password.migrator')
        );
      ELSE
        EXECUTE format(
          'ALTER ROLE veza_migrator LOGIN PASSWORD %L',
          current_setting('veza.password.migrator')
        );
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'veza_app') THEN
        EXECUTE format(
          'CREATE ROLE veza_app LOGIN PASSWORD %L NOBYPASSRLS',
          current_setting('veza.password.application')
        );
      ELSE
        EXECUTE format(
          'ALTER ROLE veza_app LOGIN PASSWORD %L NOBYPASSRLS',
          current_setting('veza.password.application')
        );
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'veza_control') THEN
        EXECUTE format(
          'CREATE ROLE veza_control LOGIN PASSWORD %L BYPASSRLS',
          current_setting('veza.password.control')
        );
      ELSE
        EXECUTE format(
          'ALTER ROLE veza_control LOGIN PASSWORD %L BYPASSRLS',
          current_setting('veza.password.control')
        );
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'veza_worker') THEN
        EXECUTE format(
          'CREATE ROLE veza_worker LOGIN PASSWORD %L BYPASSRLS',
          current_setting('veza.password.worker')
        );
      ELSE
        EXECUTE format(
          'ALTER ROLE veza_worker LOGIN PASSWORD %L BYPASSRLS',
          current_setting('veza.password.worker')
        );
      END IF;

      EXECUTE format(
        'GRANT CONNECT ON DATABASE %I TO veza_migrator, veza_app, veza_control, veza_worker',
        current_database()
      );
      EXECUTE format(
        'GRANT CREATE ON DATABASE %I TO veza_migrator',
        current_database()
      );
    END
    $roles$;
  `);
  await client.query("GRANT USAGE, CREATE ON SCHEMA public TO veza_migrator");
  await client.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
  await client.query("COMMIT");
  process.stdout.write("Production database service identities are ready.\n");
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
