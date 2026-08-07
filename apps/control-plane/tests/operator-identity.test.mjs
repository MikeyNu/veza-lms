import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("operator sign-in uses the approved Veza identity panel and a fixed viewport shell", async () => {
  const [page, component, styles, panel, logo] = await Promise.all([
    source("../app/sign-in/page.tsx"),
    source("../src/components/operator-identity-gateway.tsx"),
    source("../styles/auth.css"),
    readFile(new URL("../public/assets/panel_background.png", import.meta.url)),
    readFile(new URL("../public/assets/veza_logo_white_text_horizontal.png", import.meta.url)),
  ]);

  assert.match(page, /OperatorIdentityGateway/);
  assert.match(page, /platform-operator role/);
  assert.match(page, /multi-factor assurance/);
  assert.match(component, /Teach\. Learn\. Grow\. Together\./);
  assert.match(component, /veza_logo_white_text_horizontal\.png/);
  assert.doesNotMatch(component, /Operate tenancy, release and service controls/);
  assert.doesNotMatch(component, /operator-boundary-map/);
  assert.match(styles, /background-image:\s*url\("\/assets\/panel_background\.png"\)/);
  assert.match(styles, /block-size:\s*100dvh/);
  assert.match(styles, /\.operator-gateway\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(styles, /\.operator-gateway-action\s*\{[^}]*overflow-y:\s*auto/s);
  assert.doesNotMatch(styles, /min-height:\s*100svh/);
  assert.ok(panel.length > 100_000, "approved left-panel artwork must be present");
  assert.ok(logo.length > 100_000, "approved white Veza lockup must be present");
  assert.deepEqual([...panel.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.deepEqual([...logo.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
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
