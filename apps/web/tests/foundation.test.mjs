import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("dashboard exposes one primary heading and semantic navigation", async () => {
  const dashboard = await readFile(new URL("../src/features/dashboard/dashboard-overview.tsx", import.meta.url), "utf8");
  const shell = await readFile(new URL("../src/components/app-shell.tsx", import.meta.url), "utf8");
  const overview = await readFile(new URL("../src/features/dashboard/learning-overview.tsx", import.meta.url), "utf8");
  assert.equal((dashboard.match(/<h1/g) ?? []).length, 1);
  assert.match(shell, /aria-label="Primary navigation"/);
  assert.match(overview, /aria-label="Learning overview"/);
});

test("semantic status colours are declared as tokens", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  for (const token of ["--amber", "--red", "--green", "--blue"]) assert.match(css, new RegExp(token));
});
