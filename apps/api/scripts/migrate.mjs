import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.MIGRATION_DATABASE_URL;
if (!connectionString) throw new Error("MIGRATION_DATABASE_URL is required; runtime identities must never own schema migrations");

const pool = new Pool({ connectionString, application_name: "veza-migrator", max: 1 });
const directory = new URL("../database/migrations/", import.meta.url);
const files = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
const migrations = await Promise.all(files.map(async (file) => {
  const sql = await readFile(fileURLToPath(new URL(file, directory)), "utf8");
  const checksum = createHash("sha256").update(sql, "utf8").digest("hex");
  return { file, sql, checksum };
}));
const available = new Set(files);

const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('veza-schema-migrations'), hashtext(current_database()))");
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename text PRIMARY KEY,
    checksum_sha256 text,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  await client.query("ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum_sha256 text");

  const ledgerRows = (await client.query(
    "SELECT filename, checksum_sha256 FROM schema_migrations ORDER BY filename",
  )).rows;
  const applied = new Map(ledgerRows.map((row) => [row.filename, row.checksum_sha256]));

  for (const [filename] of applied) {
    if (!available.has(filename)) {
      throw new Error(`Applied migration ${filename} is missing from the repository`);
    }
  }

  for (const migration of migrations) {
    const recordedChecksum = applied.get(migration.file);
    if (recordedChecksum === undefined) continue;
    if (recordedChecksum && recordedChecksum !== migration.checksum) {
      throw new Error(`Applied migration ${migration.file} does not match its recorded checksum`);
    }
    if (!recordedChecksum) {
      await client.query(
        "UPDATE schema_migrations SET checksum_sha256 = $2 WHERE filename = $1 AND checksum_sha256 IS NULL",
        [migration.file, migration.checksum],
      );
    }
  }

  for (const migration of migrations) {
    if (applied.has(migration.file)) continue;
    await client.query(migration.sql);
    await client.query(
      "INSERT INTO schema_migrations(filename, checksum_sha256) VALUES ($1, $2)",
      [migration.file, migration.checksum],
    );
    process.stdout.write(`Applied ${migration.file}\n`);
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
