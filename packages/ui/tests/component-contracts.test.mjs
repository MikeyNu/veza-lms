import assert from "node:assert/strict";
import test from "node:test";
import { readSource } from "./helpers.mjs";

const required = [
  "Button", "Link", "Field", "ValidationSummary", "Combobox", "DateInput", "TimeInput",
  "DataTable", "Pagination", "Tabs", "Drawer", "Dialog", "Popover", "ToastProvider",
  "EmptyState", "LoadingState", "ErrorState", "Skeleton", "StatusIndicator", "Timeline",
  "AuditHistory", "FilterBar", "BulkActionBar", "ContextRail", "InspectorPanel",
  "CommandPalette", "FileUpload", "StructuredContent", "ContentBlock", "EditableRegion",
];

const componentModules = [
  "primitives.tsx",
  "forms.tsx",
  "combobox.tsx",
  "data.tsx",
  "tabs.tsx",
  "overlays.tsx",
  "states.tsx",
  "layout.tsx",
  "command-palette.tsx",
  "file-upload.tsx",
  "structured-content.tsx",
];

test("the public package exports the complete shared component contract", async () => {
  const index = await readSource("index.ts");
  const sources = await Promise.all(componentModules.map(readSource));
  const content = sources.join("\n");
  for (const name of required) assert.match(content, new RegExp(`export (?:function|interface|type|const) ${name}\\b`), `${name} is missing`);
  for (const module of ["accent", "catalogue", "command-palette", "combobox", "data", "file-upload", "forms", "layout", "overlays", "primitives", "states", "structured-content", "tabs"]) {
    assert.match(index, new RegExp(`export \\* from "\\./${module}\\.js"`));
  }
});

test("shared product controls use the Veza icon vocabulary instead of unicode stand-ins", async () => {
  const sources = await Promise.all(componentModules.map(readSource));
  const content = sources.join("\n");
  assert.doesNotMatch(content, /[⇧▧⌕＋×↑↓↕⋮]/u);
  assert.match(await readSource("structured-content.tsx"), /<Icon name="grip"/);
  assert.match(await readSource("file-upload.tsx"), /<Icon name="upload"/);
  assert.match(await readSource("command-palette.tsx"), /<Icon name="search"/);
});

test("the shared stylesheet avoids generic card-wall and decorative glass patterns", async () => {
  const css = await readSource("styles.css");
  assert.doesNotMatch(css, /backdrop-filter/i);
  assert.doesNotMatch(css, /(?:^|[-_])card(?:[-_{:]|$)/i);
  assert.doesNotMatch(css, /box-shadow:[^;}]*0 0 [^;}]*#[0-9a-f]{3,8}/i);
  assert.match(css, /\.vz-table-wrap\{/);
  assert.match(css, /\.vz-timeline\{/);
  assert.match(css, /\.vz-section--divided\{/);
});

test("density and transient elevation are explicit system contracts", async () => {
  const tokens = await readSource("tokens.css");
  const css = await readSource("styles.css");
  assert.match(tokens, /data-veza-density="compact"/);
  assert.match(tokens, /data-veza-density="reduced"/);
  assert.match(tokens, /--veza-z-dialog/);
  assert.match(css, /\.vz-dialog__frame[^}]*box-shadow:var\(--veza-shadow-overlay\)/);
  assert.doesNotMatch(css, /\.vz-section[^}]*box-shadow/);
});
