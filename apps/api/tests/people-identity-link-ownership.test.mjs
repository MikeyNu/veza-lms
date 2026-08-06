import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("person identity linking has one routed implementation owner", async () => {
  const [controller, module, operations, identityLinks] = await Promise.all([
    source("../src/modules/people/http/people-operations.controller.ts"),
    source("../src/modules/people/people.module.ts"),
    source("../src/modules/people/application/people-operations.service.ts"),
    source("../src/modules/people/application/people-identity-link.service.ts"),
  ]);

  assert.match(controller, /private readonly identityLinks: PeopleIdentityLinkService/);
  assert.match(controller, /return this\.identityLinks\.linkExisting\(personId, institutionId, input\)/);
  assert.match(module, /PeopleIdentityLinkService/);
  assert.doesNotMatch(operations, /async linkExistingIdentity\(/);
  assert.doesNotMatch(operations, /LinkExistingIdentityDto/);
  assert.match(identityLinks, /async linkExisting\(/);
});

test("the dedicated identity link command retains institution and evidence controls", async () => {
  const identityLinks = await source(
    "../src/modules/people/application/people-identity-link.service.ts",
  );
  assert.match(identityLinks, /role\.scope_type='institution' AND role\.scope_id=\$3/);
  assert.match(identityLinks, /person_identity_link_requests/);
  assert.match(identityLinks, /app\.allow_person_identity_link/);
  assert.match(identityLinks, /audit\.append/);
  assert.match(identityLinks, /outbox\.append/);
  assert.match(identityLinks, /aggregateVersion: Number\(evidence\.version \?\? 1\)/);
});
