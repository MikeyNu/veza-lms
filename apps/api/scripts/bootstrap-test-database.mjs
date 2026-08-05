import { readFile } from "node:fs/promises";
import pg from "pg";

const { Client } = pg;
const connectionString = process.env.BOOTSTRAP_DATABASE_URL;
if (!connectionString) {
  throw new Error("BOOTSTRAP_DATABASE_URL is required");
}

const sql = await readFile(new URL("../../../docker/postgres/init/001-service-roles.sql", import.meta.url), "utf8");
const client = new Client({ connectionString, statement_timeout: 15_000 });

try {
  await client.connect();
  await client.query(sql);
  process.stdout.write("Database service identities are ready.\n");
} finally {
  await client.end();
}
