import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
const source = (path) => readFile(new URL(path, import.meta.url), "utf8");
const exists = (path) => access(new URL(path, import.meta.url)).then(() => true, () => false);
const routes = ["people", "assessments", "communicate", "courses", "evidence", "gradebook", "insights", "learning"];
test("high-value workspace routes use shared loading and error states", async () => { for (const route of routes) { assert.equal(await exists(`../app/${route}/loading.tsx`), true, `${route} loading state missing`); assert.equal(await exists(`../app/${route}/error.tsx`), true, `${route} error state missing`); const loading = await source(`../app/${route}/loading.tsx`); const error = await source(`../app/${route}/error.tsx`); assert.match(loading, /WorkspaceRouteLoading/); assert.match(error, /WorkspaceRouteError/); } });
test("workspace route states preserve desktop and mobile task structure", async () => { const [loading, error, styles] = await Promise.all([source("../src/components/states/workspace-route-loading.tsx"), source("../src/components/states/workspace-route-error.tsx"), source("../styles/workspace-route-states.css")]); assert.match(loading, /role="status"/); assert.match(loading, /Skeleton/); assert.match(error, /No command was applied/); assert.match(error, /Retry this view/); assert.match(styles, /grid-template-columns: 15\.5rem minmax\(0, 1fr\)/); assert.match(styles, /@media \(max-width: 760px\)/); });
