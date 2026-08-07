import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("communications page separates recipient and administrative workspaces", async () => {
  const page = await read("../app/communicate/page.tsx");
  assert.match(page, /loadRecipientCommunicationsWorkspace/);
  assert.match(page, /RecipientCommunicationsWorkspaceView/);
  assert.match(page, /roles\.has\("tenant-owner"\) \|\| roles\.has\("institution-admin"\)/);
  assert.match(page, /loadCommunicationsWorkspace/);
  assert.match(page, /<CommunicationsWorkspaceView workspace=\{workspace\} canAdminister \/>/);
});

test("recipient communications API is principal scoped before browser serialization", async () => {
  const [service, controller, administration] = await Promise.all([
    read("../../api/src/platform/communications/communications-recipient.service.ts"),
    read("../../api/src/platform/communications/communications-recipient.controller.ts"),
    read("../../api/src/platform/communications/communications.controller.ts"),
  ]);
  assert.match(service, /intent\.recipient_user_id = \$1/);
  assert.match(service, /person\.linked_user_id = \$1/);
  assert.match(service, /\[context\.actorId\]/);
  assert.doesNotMatch(service, /recipient_snapshot/);
  assert.match(controller, /permissions\.tenantRead/);
  assert.match(administration, /@Get\("workspace"\)[\s\S]*permissions\.tenantConfigure/);
});

test("recipient notification preferences mutate only through the same-origin BFF", async () => {
  const [workspace, bff, navigation] = await Promise.all([
    read("../src/features/communications/recipient-communications-workspace.tsx"),
    read("../app/api/communications/[operation]/route.ts"),
    read("../src/features/workspace/navigation.ts"),
  ]);
  assert.match(workspace, /fetch\("\/api\/communications\/preference"/);
  assert.match(workspace, /id="notification-preferences"/);
  assert.match(workspace, /Required security, access and academic-result notices/);
  assert.match(bff, /isSameOriginRequest/);
  assert.match(bff, /\^preference\$/);
  assert.match(navigation, /learner: "Notifications"/);
  assert.match(navigation, /"guardian-sponsor": "Notifications"/);
});
