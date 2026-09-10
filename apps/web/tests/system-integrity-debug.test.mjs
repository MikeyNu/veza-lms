import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("dedicated tenant-owner invitation route agrees with the central route policy", async () => {
  const [policy, page] = await Promise.all([
    source("../src/features/workspace/access-policy.ts"),
    source("../app/people/invitations/new/page.tsx"),
  ]);

  assert.match(
    policy,
    /id: "people-invitations"[^\n]+roles: \["tenant-owner"\]/,
  );
  assert.match(page, /roles\.includes\("tenant-owner"\)/);
});

test("help stays available as a utility without occupying duplicate primary navigation", async () => {
  const [navigation, shell] = await Promise.all([
    source("../src/features/workspace/navigation.ts"),
    source("../src/components/app-shell-client.tsx"),
  ]);

  assert.doesNotMatch(navigation, /\{ key: "help"[^\n]+href: "\/help"/);
  assert.match(shell, /className="support-link"/);
  assert.match(shell, /href="\/help"/);
  assert.match(shell, /label: "Help and support"/);
});

test("system integrity debug sources contain no prohibited em dash characters", async () => {
  const paths = [
    "../src/features/workspace/access-policy.ts",
    "../src/features/workspace/navigation.ts",
    "../../api/scripts/migrate.mjs",
    "../../../scripts/qa/migration-validation.mjs",
  ];

  for (const path of paths) {
    assert.doesNotMatch(await source(path), /\u2014/u, `${path} contains a prohibited em dash`);
  }
});
