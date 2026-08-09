import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadPolicy() {
  const source = await readFile(
    new URL("../src/features/workspace/access-policy.ts", import.meta.url),
    "utf8",
  );
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

function session({ roles, institutionIds = [], modules = ["core", "studio-pro"] }) {
  return {
    principal: { userId: "user" },
    tenant: {},
    membership: { roles, institutionIds },
    entitlements: modules.map((module) => ({ module, state: "enabled", limits: {} })),
  };
}

test("institutional sidebar destinations fail closed without an accessible institution", async () => {
  const { canAccessWorkspacePath } = await loadPolicy();
  const ownerWithoutInstitution = session({ roles: ["tenant-owner"] });
  for (const path of ["/learning", "/studio", "/assessments", "/insights", "/evidence"]) {
    assert.equal(canAccessWorkspacePath(ownerWithoutInstitution, path), false, path);
  }

  const ownerWithInstitution = session({
    roles: ["tenant-owner"],
    institutionIds: ["institution"],
  });
  for (const path of ["/learning", "/studio", "/assessments", "/insights", "/evidence"]) {
    assert.equal(canAccessWorkspacePath(ownerWithInstitution, path), true, path);
  }
});

test("self-service role variants remain available without institution administration scope", async () => {
  const { accessRoleForWorkspacePath, canAccessWorkspacePath } = await loadPolicy();
  const learner = session({ roles: ["assessor", "learner"], modules: ["core"] });
  assert.equal(accessRoleForWorkspacePath(learner, "/learning"), "learner");
  assert.equal(canAccessWorkspacePath(learner, "/learning"), true);
  assert.equal(canAccessWorkspacePath(learner, "/insights"), true);
  assert.equal(canAccessWorkspacePath(learner, "/assessments"), false);

  const guardian = session({ roles: ["guardian-sponsor"], modules: ["core"] });
  assert.equal(canAccessWorkspacePath(guardian, "/insights"), true);
  assert.equal(canAccessWorkspacePath(guardian, "/learning"), false);
});

test("sidebar route policy enforces role, module and institution together", async () => {
  const { canAccessWorkspacePath } = await loadPolicy();
  const institutionId = ["institution"];
  assert.equal(
    canAccessWorkspacePath(
      session({ roles: ["tenant-owner"], institutionIds: institutionId, modules: ["core"] }),
      "/studio",
    ),
    false,
  );
  assert.equal(
    canAccessWorkspacePath(
      session({ roles: ["support-agent"], institutionIds: institutionId }),
      "/studio",
    ),
    false,
  );
  assert.equal(
    canAccessWorkspacePath(session({ roles: ["support-agent"] }), "/support"),
    true,
  );
});

test("navigation and guarded pages consume the shared route policy", async () => {
  const files = await Promise.all([
    readFile(new URL("../src/features/workspace/navigation.ts", import.meta.url), "utf8"),
    ...["learning", "studio", "assessments", "insights", "evidence", "design-system"].map((route) =>
      readFile(new URL(`../app/${route}/page.tsx`, import.meta.url), "utf8"),
    ),
  ]);
  assert.match(files[0], /canAccessWorkspacePath\(session, item\.href\)/);
  for (const page of files.slice(1)) assert.match(page, /requireWorkspaceAccess/);
});

test("denied and unmatched routes render an accessible non-disclosing fallback", async () => {
  const page = await readFile(new URL("../app/not-found.tsx", import.meta.url), "utf8");
  assert.match(page, /<main className="workspace-route-state workspace-route-error">/);
  assert.match(page, /<h1>This page is not available<\/h1>/);
  assert.match(page, /current workspace role may not include this area/);
  assert.doesNotMatch(page, /permission|forbidden|unauthori[sz]ed/i);
});
