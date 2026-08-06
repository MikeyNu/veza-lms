import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const directory = new URL("../../apps/api/database/migrations/", import.meta.url);
const files = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
assert.ok(files.length > 0, "at least one migration is required");
assert.equal(new Set(files).size, files.length, "migration filenames must be unique");

let scheduledJobsSchema = "";
for (const file of files) {
  assert.match(file, /^\d{4}_[a-z0-9_]+\.sql$/, `${file} must use the ordered migration naming convention`);
  const source = await readFile(new URL(file, directory), "utf8");
  assert.ok(source.trim().length > 0, `${file} must not be empty`);
  assert.doesNotMatch(source, /DROP\s+(?:TABLE|SCHEMA|DATABASE)\b/i, `${file} contains a destructive rollback operation`);
  assert.doesNotMatch(source, /ALTER\s+TABLE\s+\S+\s+DISABLE\s+ROW\s+LEVEL\s+SECURITY/i, `${file} disables RLS`);
  assert.doesNotMatch(
    source,
    /ON\s+CONFLICT\s*\(\s*job_key\s*\)\s*WHERE\s+tenant_id\s+IS\s+NULL/i,
    `${file} uses a scheduled_jobs conflict target that does not match the canonical uniqueness constraint`,
  );
  if (/CREATE\s+TABLE\s+scheduled_jobs\b/i.test(source)) scheduledJobsSchema = source;
}

assert.match(
  scheduledJobsSchema,
  /UNIQUE\s+NULLS\s+NOT\s+DISTINCT\s*\(\s*tenant_id\s*,\s*job_key\s*\)/i,
  "scheduled_jobs must use one canonical null-safe uniqueness constraint",
);
process.stdout.write(`Validated ${files.length} forward-only migrations and scheduled-job conflict targets.\n`);
