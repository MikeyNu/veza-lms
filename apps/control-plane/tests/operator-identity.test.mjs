import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("operator sign-in uses a separate branded multi-panel boundary", async () => {
  const [page, component, styles] = await Promise.all([
    source("../app/sign-in/page.tsx"),
    source("../src/components/operator-identity-gateway.tsx"),
    source("../styles/auth.css"),
  ]);
  assert.match(page, /OperatorIdentityGateway/);
  assert.match(page, /platform-operator role/);
  assert.match(page, /multi-factor assurance/);
  assert.match(component, /Tenant data excluded/);
  assert.match(styles, /grid-template-columns: minmax\(0, 1\.16fr\) minmax\(28rem, \.84fr\)/);
  assert.doesNotMatch(styles, /#7568ea/i);
  assert.match(styles, /#0f766e/i);
  assert.doesNotMatch(styles, /\.operator-gateway-story\s*\{[^}]*display:\s*none/s);
});

test("operator identity route has loading and recoverable error states", async () => {
  const [loading, error] = await Promise.all([
    source("../app/sign-in/loading.tsx"),
    source("../app/sign-in/error.tsx"),
  ]);
  assert.match(loading, /Skeleton/);
  assert.match(loading, /role="status"/);
  assert.match(error, /Retry operator sign-in/);
  assert.match(error, /No control-plane session was created/);
});
