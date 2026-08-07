import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.MIGRATION_DATABASE_URL;
if (!connectionString) throw new Error("MIGRATION_DATABASE_URL is required; runtime identities must never own schema migrations");

const pool = new Pool({ connectionString, application_name: "veza-migrator", max: 1 });
const directory = new URL("../database/migrations/", import.meta.url);
const files = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();

const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const applied = new Set((await client.query("SELECT filename FROM schema_migrations")).rows.map((row) => row.filename));
  for (const file of files) {
    if (applied.has(file)) continue;
    // URL.pathname is "/C:/..." on Windows; fileURLToPath keeps this portable.
    const sql = await readFile(fileURLToPath(new URL(file, directory)), "utf8");
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations(filename) VALUES ($1)", [file]);
    process.stdout.write(`Applied ${file}\n`);
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
