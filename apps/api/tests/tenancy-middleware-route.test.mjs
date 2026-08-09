import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("tenant request context uses the named Nest wildcard syntax", async () => {
  const source = await readFile(
    new URL("../src/modules/tenancy/tenancy.module.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /path:\s*"\{\*path\}"/);
  assert.doesNotMatch(source, /path:\s*"\*"/);
});
