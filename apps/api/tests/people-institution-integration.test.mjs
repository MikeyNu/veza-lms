import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("people controller makes institutional mutations scope-aware", async () => {
  const controller = await read("src/modules/people/http/people.controller.ts");
  assert.match(controller, /assertInstitutionPermission/);
  assert.match(controller, /buildInstitutionResource/);
  assert.match(
    controller,
    /:personId\/institutions\/:institutionId\/relationships/,
  );
  assert.match(
    controller,
    /institutions\/:institutionId\/relationships\/:relationshipId\/verify/,
  );
});

test("relationship transitions match both relationship and institution", async () => {
  const service = await read(
    "src/modules/people/application/institution-relationship.service.ts",
  );
  assert.match(service, /institution_id = \$2/);
  assert.match(service, /version = \$3/);
  assert.match(service, /person-relationship/);
  assert.match(service, /transactional|outbox|this\.outbox\.append/);
});

test("people detail exposes institution relationship evidence", async () => {
  const query = await read(
    "src/modules/people/application/people-query.service.ts",
  );
  assert.match(query, /institution_id/);
  assert.match(query, /person_relationships/);
});
