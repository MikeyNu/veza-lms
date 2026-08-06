import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const patterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ["generic bearer token", /\bBearer\s+[A-Za-z0-9._~+/=-]{48,}\b/i],
];
const ignoredBinaryExtensions = /\.(?:png|jpe?g|gif|webp|pdf|zip|woff2?|ttf|ico)$/i;
const findings = [];

for (const file of files) {
  if (ignoredBinaryExtensions.test(file) || file === "pnpm-lock.yaml") continue;
  let content;
  try {
    content = execFileSync("git", ["show", `:${file}`], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  } catch {
    continue;
  }
  for (const [name, pattern] of patterns) {
    if (pattern.test(content)) findings.push(`${file}: ${name}`);
  }
}

assert.deepEqual(findings, [], `Potential committed secrets found:\n${findings.join("\n")}`);
process.stdout.write(`High-confidence secret scan passed for ${files.length} tracked files.\n`);
