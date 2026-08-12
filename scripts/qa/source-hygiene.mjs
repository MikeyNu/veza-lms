import { readdir, readFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const roots = [
  "apps/web/app",
  "apps/web/src",
  "apps/web/styles",
  "packages/ui/src",
];
const sourceExtensions = new Set([".css", ".js", ".mjs", ".ts", ".tsx"]);

const checks = [
  {
    id: "browser-modal",
    message: "Use shared accessible dialogs instead of browser prompt, alert, or confirm APIs.",
    pattern: /\bwindow\.(?:prompt|alert|confirm)\s*\(/g,
  },
  {
    id: "placeholder-route",
    message: "Executable application routes must never contain placeholder resource identifiers.",
    pattern: /\/placeholder(?:\/|["'`])/g,
  },
  {
    id: "inline-global-style",
    message: "Feature components must not own global CSS. Move styles to the documented stylesheet owner.",
    pattern: /<style\s+jsx\s+global\b/gi,
  },
  {
    id: "glass-filter",
    message: "Veza does not use decorative backdrop blur or glassmorphism in product UI.",
    pattern: /(?:^|[;{\s])(?:-webkit-)?backdrop-filter\s*:/gim,
  },
  {
    id: "unsafe-double-cast",
    message: "Validate external data instead of casting through unknown.",
    pattern: /\bas\s+unknown\s+as\b/g,
  },
  {
    id: "unicode-product-icon-css",
    message: "CSS-generated product icons must use the shared Lucide-backed icon vocabulary.",
    pattern: /content\s*:\s*["'][^"'\n]*[→✓⇧▧⌕＋×↑↓↕⋮][^"'\n]*["']/gu,
  },
  {
    id: "unicode-product-icon-jsx",
    message: "Product controls must use shared icons instead of Unicode glyph stand-ins.",
    pattern: />\s*[⇧▧⌕＋×↑↓↕⋮]\s*</gu,
  },
  {
    id: "em-dash",
    message: "Project source must not contain em dashes.",
    pattern: /—/gu,
  },
];

async function collect(directory) {
  const absolute = resolve(repositoryRoot, directory);
  const entries = await readdir(absolute, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = resolve(absolute, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collect(relative(repositoryRoot, child)));
    } else if (entry.isFile() && sourceExtensions.has(extname(entry.name))) {
      files.push(child);
    }
  }
  return files;
}

function lineAndColumn(source, index) {
  const before = source.slice(0, index);
  const lines = before.split("\n");
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}

const files = (await Promise.all(roots.map(collect))).flat().sort();
const findings = [];

for (const file of files) {
  const source = await readFile(file, "utf8");
  for (const check of checks) {
    check.pattern.lastIndex = 0;
    for (const match of source.matchAll(check.pattern)) {
      const location = lineAndColumn(source, match.index ?? 0);
      findings.push({
        check: check.id,
        message: check.message,
        path: relative(repositoryRoot, file).replaceAll("\\", "/"),
        line: location.line,
        column: location.column,
        excerpt: match[0].replaceAll("\n", " ").slice(0, 120),
      });
    }
  }
}

if (findings.length > 0) {
  console.error(`Source hygiene failed with ${findings.length} finding${findings.length === 1 ? "" : "s"}:`);
  for (const finding of findings) {
    console.error(`- [${finding.check}] ${finding.path}:${finding.line}:${finding.column} ${finding.excerpt}`);
    console.error(`  ${finding.message}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Source hygiene passed across ${files.length} source files.`);
}
