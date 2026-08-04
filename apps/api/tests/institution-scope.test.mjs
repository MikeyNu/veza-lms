import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("institution administrators query only their authorised institution resource", async () => {
  const controller = await source("../src/modules/institution-structure/http/institution-setup.controller.ts");
  const query = await source("../src/modules/institution-structure/application/institution-query.service.ts");
  assert.match(controller, /@Get\("institutions\/:institutionId"\)/);
  assert.match(controller, /permissions\.institutionConfigure/);
  assert.match(query, /withTenantTransaction\(context\.tenantId/);
  assert.match(query, /WHERE tenant_id = \$1 AND id = \$2/);
  assert.doesNotMatch(query, /controlPlaneQuery/);
});
