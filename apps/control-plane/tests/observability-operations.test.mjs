import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("control plane mounts privileged observability operations", async () => {
  const [page, dashboard, navigation] = await Promise.all([
    read("app/observability/page.tsx"),
    read("src/features/observability/observability-operations-dashboard.tsx"),
    read("src/components/control-plane-shell.tsx"),
  ]);
  assert.match(page, /requireOperatorSession/);
  assert.match(page, /ObservabilityOperationsDashboard/);
  assert.match(navigation, /\/observability/);
  assert.match(dashboard, /RUNTIME HEARTBEATS/);
  assert.match(dashboard, /SERVICE OBJECTIVES/);
  assert.match(dashboard, /ALERT POLICY/);
  assert.match(dashboard, /INCIDENT OPERATIONS/);
  assert.match(dashboard, /ERROR REPORTING/);
});

test("observability mutations use exact status and state envelopes", async () => {
  const dashboard = await read("src/features/observability/observability-operations-dashboard.tsx");
  assert.match(dashboard, /apply\(operation, \{ status, reason \}, success\)/);
  assert.match(dashboard, /apply\(operation, \{ state, reason \}, success\)/);
  assert.doesNotMatch(dashboard, /\{ state, status: state, reason \}/);
});

test("observability BFF enforces operator session and same origin", async () => {
  const route = await read("app/api/observability/[operation]/route.ts");
  assert.match(route, /isSameOriginRequest/);
  assert.match(route, /getOperatorSession/);
  assert.match(route, /Platform operator authentication is required/);
});
