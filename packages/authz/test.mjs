import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAccess } from "./dist/index.js";

const resource = { type: "tenant", id: "tenant-1", ancestors: [] };
const context = {
  now: "2026-08-04T19:00:00.000Z",
  authenticationMethods: ["pwd", "mfa"],
  enabledModules: ["core"],
};

test("deny assignments take precedence only while their conditions apply", () => {
  const allow = { effect: "allow", permission: "tenant.read", scopeType: "tenant", scopeId: "tenant-1" };
  const expiredDeny = {
    effect: "deny",
    permission: "tenant.read",
    scopeType: "tenant",
    scopeId: "tenant-1",
    conditions: { validUntil: "2026-08-04T18:00:00.000Z" },
  };
  assert.deepEqual(evaluateAccess([allow, expiredDeny], "tenant.read", resource, context), {
    allowed: true,
    reason: "allowed",
  });

  const activeDeny = {
    ...expiredDeny,
    conditions: { validUntil: "2026-08-04T20:00:00.000Z" },
  };
  assert.deepEqual(evaluateAccess([allow, activeDeny], "tenant.read", resource, context), {
    allowed: false,
    reason: "explicit-deny",
  });
});

test("scope and module conditions fail closed", () => {
  const assignment = {
    effect: "allow",
    permission: "tenant.configure",
    scopeType: "tenant",
    scopeId: "tenant-1",
    conditions: { requiredModule: "integration-hub" },
  };
  assert.deepEqual(evaluateAccess([assignment], "tenant.configure", resource, context), {
    allowed: false,
    reason: "condition-failed",
  });
});
