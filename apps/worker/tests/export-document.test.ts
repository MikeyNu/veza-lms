import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { renderExport, type ExportDocument } from "../src/export-document.js";

function fixture(rowCount = 2): ExportDocument {
  return {
    exportId: "11111111-1111-4111-8111-111111111111",
    title: "Learner transcript export",
    generatedAt: "2026-08-06T01:00:00.000Z",
    tenantName: "Sgela Academy",
    institutionName: "Johannesburg Campus",
    columns: ["learner", "course", "result"],
    rows: Array.from({ length: rowCount }, (_, index) => ({
      learner: `Learner ${index + 1}`,
      course: index === 0 ? "Project Management" : "Digital Learning Design",
      result: index === 0 ? 78.5 : 91,
    })),
    filters: { learnerStatus: "active", includeSuperseded: false },
  };
}

test("PDF export is deterministic, checksummed and structurally complete", () => {
  const first = renderExport(fixture(), "pdf");
  const second = renderExport(fixture(), "pdf");
  assert.deepEqual(first.bytes, second.bytes);
  assert.equal(first.mediaType, "application/pdf");
  assert.equal(first.extension, "pdf");
  assert.equal(first.rowCount, 2);
  assert.equal(first.bytes.subarray(0, 8).toString("ascii"), "%PDF-1.7");
  assert.match(first.bytes.toString("ascii"), /xref\n0 \d+/);
  assert.match(first.bytes.toString("ascii"), /trailer\n<< \/Size \d+ \/Root 1 0 R >>/);
  assert.ok(first.bytes.toString("ascii").endsWith("%%EOF\n"));
  assert.equal(first.checksumSha256, createHash("sha256").update(first.bytes).digest("hex"));
});

test("PDF export paginates large datasets and includes a footer on every page", () => {
  const result = renderExport(fixture(140), "pdf");
  const source = result.bytes.toString("ascii");
  const pageObjects = source.match(/\/Type \/Page \/Parent/g) ?? [];
  assert.ok(pageObjects.length >= 3);
  for (let page = 1; page <= pageObjects.length; page += 1) {
    assert.match(source, new RegExp(`Veza Learning Cloud \\| Page ${page} of ${pageObjects.length}`));
  }
});

test("CSV export preserves columns, quotes unsafe cells and emits a UTF-8 BOM", () => {
  const document = fixture(1);
  const result = renderExport({
    ...document,
    rows: [{ learner: 'Mpho "Mo" Dlamini', course: "Design, Media", result: "Line 1\nLine 2" }],
  }, "csv");
  assert.equal(result.mediaType, "text/csv");
  assert.equal(result.bytes.subarray(0, 3).toString("hex"), "efbbbf");
  const source = result.bytes.toString("utf8");
  assert.match(source, /"Mpho ""Mo"" Dlamini"/);
  assert.match(source, /"Design, Media"/);
  assert.match(source, /"Line 1\nLine 2"/);
});

test("JSON export uses stable key ordering", () => {
  const document = fixture(1);
  const result = renderExport({
    ...document,
    filters: { zeta: 1, alpha: { delta: true, beta: false } },
  }, "json");
  const source = result.bytes.toString("utf8");
  assert.ok(source.indexOf('"alpha"') < source.indexOf('"zeta"'));
  assert.ok(source.indexOf('"beta"') < source.indexOf('"delta"'));
});
