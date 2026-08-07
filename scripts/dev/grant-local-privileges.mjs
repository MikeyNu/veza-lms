/**
 * Grants the runtime roles access to every table in the local database.
 *
 * Migrations grant privileges table by table and a number of the newer ones
 * omit it, so apps/api fails at runtime with "permission denied for table ...".
 * This is a blanket development-only backfill: production grants should stay
 * explicit and least-privilege, so do NOT turn this into a migration.
 *
 * Re-run after `pnpm --filter @veza/api db:migrate`.
 */
import pg from "pg";

const { Pool } = pg;
const connectionString =
  process.env.SEED_DATABASE_URL ?? "postgresql://veza_bootstrap:veza_bootstrap@localhost:5432/veza";

const pool = new Pool({ connectionString, application_name: "veza-dev-grants", max: 1 });
const client = await pool.connect();

const readWrite = ["veza_app", "veza_worker"];
const readWriteControl = ["veza_control"];

try {
  await client.query("BEGIN");
  for (const role of [...readWrite, ...readWriteControl]) {
    await client.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role}`);
    await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
    await client.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO ${role}`);
    // Cover tables created by future migrations too.
    await client.query(
      `ALTER DEFAULT PRIVILEGES FOR ROLE veza_migrator IN SCHEMA public
       GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role}`,
    );
    await client.query(
      `ALTER DEFAULT PRIVILEGES FOR ROLE veza_migrator IN SCHEMA public
       GRANT USAGE, SELECT ON SEQUENCES TO ${role}`,
    );
  }
  await client.query("COMMIT");

  const granted = await client.query(
    `SELECT grantee, count(DISTINCT table_name) AS tables
       FROM information_schema.table_privileges
      WHERE table_schema = 'public' AND privilege_type = 'SELECT'
        AND grantee = ANY($1)
      GROUP BY grantee ORDER BY grantee`,
    [[...readWrite, ...readWriteControl]],
  );
  const total = (
    await client.query(
      `SELECT count(*) AS n FROM information_schema.tables
        WHERE table_schema='public' AND table_type='BASE TABLE'`,
    )
  ).rows[0].n;
  for (const row of granted.rows) {
    process.stdout.write(`${row.grantee}: SELECT on ${row.tables}/${total} tables\n`);
  }
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
