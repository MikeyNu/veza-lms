import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path) { return readFile(new URL(path, import.meta.url), "utf8"); }

test("plan inspection is platform-operator guarded and read only", async () => {
  const [controller, service] = await Promise.all([
    source("../src/modules/platform-operations/http/control-plane-plans.controller.ts"),
    source("../src/modules/platform-operations/application/plan-operations.service.ts"),
  ]);
  assert.match(controller, /PlatformOperatorGuard/);
  assert.match(controller, /@Get\(\)/);
  assert.doesNotMatch(controller, /@Post|@Patch|@Delete/);
  assert.match(service, /FROM plans/);
  assert.match(service, /LEFT JOIN tenants/);
  assert.match(service, /controlPlaneQuery/);
});
