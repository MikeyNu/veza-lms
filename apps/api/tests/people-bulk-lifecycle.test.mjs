import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("people bulk status is bounded, versioned and excludes sensitive terminal records", async () => {
  const [dto, service] = await Promise.all([
    source("../src/modules/people/application/people-bulk.dto.ts"),
    source("../src/modules/people/application/people-bulk.service.ts"),
  ]);
  assert.match(dto, /ArrayMaxSize\(100\)/);
  assert.match(dto, /ArrayUnique/);
  assert.match(dto, /expectedVersion/);
  assert.match(dto, /\["active", "inactive"\]/);
  assert.doesNotMatch(dto, /deceased/);
  assert.match(service, /FOR UPDATE/);
  assert.match(service, /withTenantTransaction/);
  assert.match(service, /current\.version !== record\.expectedVersion/);
  assert.match(service, /\["merged", "deceased"\]/);
});

test("people bulk status requires permission and MFA and records per-person evidence", async () => {
  const [controller, service, module] = await Promise.all([
    source("../src/modules/people/http/people-bulk.controller.ts"),
    source("../src/modules/people/application/people-bulk.service.ts"),
    source("../src/modules/people/people.module.ts"),
  ]);
  assert.match(controller, /permissions\.peopleUpdate/);
  assert.match(controller, /MfaGuard/);
  assert.match(service, /audit\.append/);
  assert.match(service, /outbox\.append/);
  assert.match(service, /aggregateId: current\.id/);
  assert.match(service, /operationId/);
  assert.match(module, /PeopleBulkController/);
  assert.match(module, /PeopleBulkService/);
});
