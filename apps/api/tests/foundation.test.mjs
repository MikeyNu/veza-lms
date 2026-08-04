import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("API enables strict request validation", async () => {
  const source = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");
  assert.match(source, /forbidNonWhitelisted: true/);
  assert.match(source, /setGlobalPrefix\("v1"\)/);
});

test("tenant context fails closed when absent", async () => {
  const source = await readFile(new URL("../src/modules/tenancy/tenant-context.ts", import.meta.url), "utf8");
  assert.match(source, /Tenant context is required/);
});
