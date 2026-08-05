import assert from "node:assert/strict";
import test from "node:test";
import { readSource } from "./helpers.mjs";

test("composite widgets expose keyboard and screen-reader semantics", async () => {
  const combobox = await readSource("combobox.tsx");
  const tabs = await readSource("tabs.tsx");
  const command = await readSource("command-palette.tsx");
  for (const token of ["role=\"combobox\"", "aria-activedescendant", "role=\"listbox\"", "role=\"option\"", "ArrowDown", "ArrowUp", "Home", "End", "Escape"]) assert.ok(combobox.includes(token), `Combobox missing ${token}`);
  for (const token of ["role=\"tablist\"", "role=\"tab\"", "role=\"tabpanel\"", "aria-selected", "aria-controls", "ArrowLeft", "ArrowRight", "Home", "End"]) assert.ok(tabs.includes(token), `Tabs missing ${token}`);
  for (const token of ["Ctrl", "metaKey", "role=\"combobox\"", "role=\"listbox\"", "role=\"option\"", "Escape", "Enter"]) assert.ok(command.includes(token), `Command palette missing ${token}`);
});

test("forms, uploads and feedback use native or explicit accessible boundaries", async () => {
  const forms = await readSource("forms.tsx");
  const upload = await readSource("file-upload.tsx");
  const overlays = await readSource("overlays.tsx");
  const data = await readSource("data.tsx");
  assert.match(forms, /aria-errormessage/);
  assert.match(forms, /role="alert"/);
  assert.match(forms, /<fieldset/);
  assert.match(upload, /type="file"/);
  assert.match(upload, /<progress/);
  assert.match(upload, /role="alert"/);
  assert.match(overlays, /<dialog/);
  assert.match(overlays, /aria-labelledby/);
  assert.match(data, /<caption/);
  assert.match(data, /aria-sort/);
});

test("reduced motion, forced colours and visible focus remain mandatory", async () => {
  const css = await readSource("styles.css");
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /forced-colors:active/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /box-shadow:var\(--veza-focus\)/);
});
