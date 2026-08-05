import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { packageRoot, readSource } from "./helpers.mjs";

test("layout CSS uses logical properties and supports narrow long-text layouts", async () => {
  const css = await readSource("styles.css");
  for (const token of ["margin-inline", "padding-inline", "border-inline", "minmax(0,1fr)"]) assert.ok(css.includes(token), `Missing logical or resilient layout token: ${token}`);
  assert.match(css, /@media\(max-width:600px\)/);
});

test("the catalogue exposes long text, RTL and institution accent scenarios", async () => {
  const catalogue = await readFile(join(packageRoot, "../../apps/web/src/features/design-system/design-system-catalogue.tsx"), "utf8");
  assert.match(catalogue, /Long text/);
  assert.match(catalogue, /Right-to-left/);
  assert.match(catalogue, /Institution accent/);
  assert.match(catalogue, /multilingual, regulated and operationally complex learning institutions/);
  assert.match(catalogue, /dir=\{rtl \? "rtl" : "ltr"\}/);
});
