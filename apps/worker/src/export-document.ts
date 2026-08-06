import { createHash } from "node:crypto";

export interface ExportDocument {
  readonly exportId: string;
  readonly title: string;
  readonly generatedAt: string;
  readonly tenantName: string;
  readonly institutionName?: string;
  readonly columns: readonly string[];
  readonly rows: readonly Readonly<Record<string, unknown>>[];
  readonly filters: Readonly<Record<string, unknown>>;
}

export interface RenderedExport {
  readonly bytes: Buffer;
  readonly mediaType: "application/pdf" | "text/csv" | "application/json";
  readonly extension: "pdf" | "csv" | "json";
  readonly checksumSha256: string;
  readonly rowCount: number;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  return JSON.stringify(stableValue(value));
}

function csvCell(value: unknown): string {
  const rendered = text(value);
  return /[",\r\n]/.test(rendered) ? `"${rendered.replaceAll('"', '""')}"` : rendered;
}

function renderCsv(document: ExportDocument): Buffer {
  const lines = [
    document.columns.map(csvCell).join(","),
    ...document.rows.map((row) => document.columns.map((column) => csvCell(row[column])).join(",")),
  ];
  return Buffer.from(`\uFEFF${lines.join("\r\n")}\r\n`, "utf8");
}

function renderJson(document: ExportDocument): Buffer {
  return Buffer.from(`${JSON.stringify(stableValue(document), null, 2)}\n`, "utf8");
}

function ascii(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[•·]/g, "-")
    .replace(/[^\x20-\x7E]/g, "?");
}

function pdfString(value: string): string {
  return ascii(value).replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function wrap(value: string, maximum = 92): readonly string[] {
  const output: string[] = [];
  for (const paragraph of value.replaceAll("\r", "").split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      output.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      if (word.length > maximum) {
        if (line) output.push(line);
        for (let offset = 0; offset < word.length; offset += maximum) {
          output.push(word.slice(offset, offset + maximum));
        }
        line = "";
        continue;
      }
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length > maximum) {
        output.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) output.push(line);
  }
  return output;
}

function documentLines(document: ExportDocument): readonly string[] {
  const lines = [
    document.title,
    `${document.tenantName}${document.institutionName ? ` | ${document.institutionName}` : ""}`,
    `Generated: ${document.generatedAt}`,
    `Export ID: ${document.exportId}`,
    `Rows: ${document.rows.length}`,
    `Filters: ${JSON.stringify(stableValue(document.filters))}`,
    "",
    document.columns.join(" | "),
    "-".repeat(92),
  ];
  for (const row of document.rows) {
    const rendered = document.columns.map((column) => `${column}: ${text(row[column])}`).join(" | ");
    lines.push(...wrap(rendered));
  }
  if (document.rows.length === 0) lines.push("No records matched the export filters.");
  return lines.flatMap((line) => wrap(line));
}

function contentStream(lines: readonly string[], pageNumber: number, pageCount: number): string {
  const body = lines
    .map((line, index) => `${index === 0 ? "" : "0 -14 Td "}(${pdfString(line)}) Tj`)
    .join("\n");
  return [
    "BT",
    "/F1 9 Tf",
    "48 790 Td",
    body,
    "ET",
    "BT",
    "/F1 8 Tf",
    "48 28 Td",
    `(Veza Learning Cloud | Page ${pageNumber} of ${pageCount}) Tj`,
    "ET",
  ].join("\n");
}

function renderPdf(document: ExportDocument): Buffer {
  const lines = documentLines(document);
  const linesPerPage = 52;
  const pages = Array.from(
    { length: Math.max(1, Math.ceil(lines.length / linesPerPage)) },
    (_, index) => lines.slice(index * linesPerPage, (index + 1) * linesPerPage),
  );
  const fontObject = 3 + pages.length * 2;
  const objects = new Map<number, Buffer>();
  const pageReferences: string[] = [];
  objects.set(1, Buffer.from("<< /Type /Catalog /Pages 2 0 R >>", "ascii"));
  for (let index = 0; index < pages.length; index += 1) {
    const pageObject = 3 + index * 2;
    const streamObject = pageObject + 1;
    pageReferences.push(`${pageObject} 0 R`);
    const stream = Buffer.from(contentStream(pages[index] ?? [], index + 1, pages.length), "ascii");
    objects.set(
      pageObject,
      Buffer.from(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontObject} 0 R >> >> /Contents ${streamObject} 0 R >>`,
        "ascii",
      ),
    );
    objects.set(
      streamObject,
      Buffer.concat([
        Buffer.from(`<< /Length ${stream.length} >>\nstream\n`, "ascii"),
        stream,
        Buffer.from("\nendstream", "ascii"),
      ]),
    );
  }
  objects.set(2, Buffer.from(`<< /Type /Pages /Kids [${pageReferences.join(" ")}] /Count ${pages.length} >>`, "ascii"));
  objects.set(fontObject, Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>", "ascii"));

  const chunks: Buffer[] = [Buffer.from("%PDF-1.7\n%Veza\n", "ascii")];
  const offsets = [0];
  let length = chunks[0]?.length ?? 0;
  for (let objectNumber = 1; objectNumber <= fontObject; objectNumber += 1) {
    const object = objects.get(objectNumber);
    if (!object) throw new Error(`PDF object ${objectNumber} is missing`);
    offsets[objectNumber] = length;
    const chunk = Buffer.concat([
      Buffer.from(`${objectNumber} 0 obj\n`, "ascii"),
      object,
      Buffer.from("\nendobj\n", "ascii"),
    ]);
    chunks.push(chunk);
    length += chunk.length;
  }
  const xrefOffset = length;
  const xref = ["xref", `0 ${fontObject + 1}`, "0000000000 65535 f "];
  for (let objectNumber = 1; objectNumber <= fontObject; objectNumber += 1) {
    xref.push(`${String(offsets[objectNumber] ?? 0).padStart(10, "0")} 00000 n `);
  }
  chunks.push(
    Buffer.from(
      `${xref.join("\n")}\ntrailer\n<< /Size ${fontObject + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
      "ascii",
    ),
  );
  return Buffer.concat(chunks);
}

export function renderExport(
  document: ExportDocument,
  format: "csv" | "json" | "pdf",
): RenderedExport {
  const bytes = format === "pdf" ? renderPdf(document) : format === "csv" ? renderCsv(document) : renderJson(document);
  return {
    bytes,
    mediaType: format === "pdf" ? "application/pdf" : format === "csv" ? "text/csv" : "application/json",
    extension: format,
    checksumSha256: createHash("sha256").update(bytes).digest("hex"),
    rowCount: document.rows.length,
  };
}
