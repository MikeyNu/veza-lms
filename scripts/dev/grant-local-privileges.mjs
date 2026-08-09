/** Reconciles a local database to the migration-defined least-privilege ACL. */
import { readFile } from "node:fs/promises";
import pg from "pg";

const { Pool } = pg;
const connectionString =
  process.env.SEED_DATABASE_URL ??
  "postgresql://veza_bootstrap:veza_bootstrap@localhost:5432/veza";

const pool = new Pool({
  connectionString,
  application_name: "veza-dev-grants",
  max: 1,
});
const client = await pool.connect();

try {
  const repair = await readFile(
    new URL("../../apps/api/database/migrations/0058_runtime_least_privilege_repair.sql", import.meta.url),
    "utf8",
  );
  await client.query(repair);

  const granted = await client.query(
    `SELECT grantee, count(DISTINCT table_name) AS tables
       FROM information_schema.table_privileges
      WHERE table_schema = 'public' AND privilege_type = 'SELECT'
        AND grantee = ANY($1)
      GROUP BY grantee ORDER BY grantee`,
    [["veza_app", "veza_control", "veza_worker"]],
  );
  const total = (
    await client.query(
      `SELECT count(*) AS n FROM information_schema.tables
        WHERE table_schema='public' AND table_type='BASE TABLE'`,
    )
  ).rows[0].n;
  for (const row of granted.rows) {
    process.stdout.write(
      `${row.grantee}: SELECT on ${row.tables}/${total} tables\n`,
    );
  }
} finally {
  client.release();
  await pool.end();
}
