import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const directory = new URL("../../apps/api/database/migrations/", import.meta.url);
const files = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
assert.ok(files.length > 0, "at least one migration is required");
assert.equal(new Set(files).size, files.length, "migration filenames must be unique");
for (const file of files) {
  assert.match(file, /^\d{4}_[a-z0-9_]+\.sql$/, `${file} must use the ordered migration naming convention`);
  const source = await readFile(new URL(file, directory), "utf8");
  assert.ok(source.trim().length > 0, `${file} must not be empty`);
  assert.doesNotMatch(source, /DROP\s+(?:TABLE|SCHEMA|DATABASE)\b/i, `${file} contains a destructive rollback operation`);
  assert.doesNotMatch(source, /ALTER\s+TABLE\s+\S+\s+DISABLE\s+ROW\s+LEVEL\s+SECURITY/i, `${file} disables RLS`);
}
process.stdout.write(`Validated ${files.length} forward-only migrations.\n`);
