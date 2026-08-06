import assert from "node:assert/strict";
import test from "node:test";
import "./authentication-assurance.test.mjs";
import "./assignment-session.test.mjs";
import "./governed-export-api.test.mjs";
import { TenantActivationService } from "../../dist/modules/institution-structure/application/tenant-activation.service.js";

const context = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  actorId: "22222222-2222-4222-8222-222222222222",
  membershipId: "33333333-3333-4333-8333-333333333333",
  correlationId: "qe-domain-invariants",
};

function createHarness({ institutionType = "university", policies, tenantStatus = "provisioning", updateCount = 1 } = {}) {
  const policySet = policies ?? ["privacy", "data-retention", "acceptable-use", "support-escalation"];
  const auditWrites = [];
  const outboxWrites = [];
  const client = {
    async query(sql) {
      if (sql.includes("SELECT status FROM tenants")) return { rows: [{ status: tenantStatus }], rowCount: 1 };
      if (sql.includes("FROM tenant_setup_profiles")) return { rows: [{ count: 1 }], rowCount: 1 };
      if (sql.includes("FROM tenant_entitlements")) return { rows: [{ count: 1 }], rowCount: 1 };
      if (sql.includes("FROM memberships m")) return { rows: [{ count: 1 }], rowCount: 1 };
      if (sql.includes("FROM institutions i")) {
        return {
          rows: [{
            id: "44444444-4444-4444-8444-444444444444",
            display_name: "Quality Engineering Institute",
            institution_type: institutionType,
            primary_campuses: 1,
            published_periods: 1,
            approved_policies: policySet,
          }],
          rowCount: 1,
        };
      }
      if (sql.includes("UPDATE tenants")) return { rows: updateCount === 1 ? [{ status: "active" }] : [], rowCount: updateCount };
      throw new Error(`Unexpected SQL in unit harness: ${sql}`);
    },
  };
  const database = {
    async withTenantTransaction(tenantId, operation) {
      assert.equal(tenantId, context.tenantId);
      return operation(client);
    },
  };
  const tenantContext = { require: () => context };
  const audit = { async append(_client, value) { auditWrites.push(value); } };
  const outbox = { async append(_client, value) { outboxWrites.push(value); } };
  return {
    service: new TenantActivationService(database, tenantContext, audit, outbox),
    auditWrites,
    outboxWrites,
  };
}

test("activation readiness is derived from durable institutional facts", async () => {
  const { service } = createHarness();
  const result = await service.readiness();
  assert.equal(result.ready, true);
  assert.equal(result.tenantStatus, "provisioning");
  assert.ok(result.checks.every((check) => check.passed));
});

test("school activation requires an effective safeguarding policy", async () => {
  const { service } = createHarness({ institutionType: "school" });
  const result = await service.readiness();
  assert.equal(result.ready, false);
  const policyCheck = result.checks.find((check) => check.key.endsWith(":policies"));
  assert.equal(policyCheck?.passed, false);
  assert.match(policyCheck?.detail ?? "", /safeguarding/);
});

test("failed activation never writes audit or outbox evidence", async () => {
  const harness = createHarness({ policies: [] });
  await assert.rejects(harness.service.activate(), /activation requirements are not satisfied/i);
  assert.equal(harness.auditWrites.length, 0);
  assert.equal(harness.outboxWrites.length, 0);
});

test("successful activation writes audit and outbox evidence exactly once", async () => {
  const harness = createHarness();
  const result = await harness.service.activate();
  assert.equal(result.tenantStatus, "active");
  assert.equal(harness.auditWrites.length, 1);
  assert.equal(harness.outboxWrites.length, 1);
  assert.equal(harness.auditWrites[0].eventType, "tenant.activated");
  assert.equal(harness.outboxWrites[0].eventName, "tenant.activated");
});

test("activation detects a concurrent tenant status transition", async () => {
  const harness = createHarness({ updateCount: 0 });
  await assert.rejects(harness.service.activate(), /status changed before activation completed/i);
  assert.equal(harness.auditWrites.length, 0);
  assert.equal(harness.outboxWrites.length, 0);
});
