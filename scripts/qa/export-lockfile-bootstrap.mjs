import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const lockfilePath = fileURLToPath(new URL("../../pnpm-lock.yaml", import.meta.url));
const publicDirectory = fileURLToPath(new URL("../../apps/web/public", import.meta.url));
const lockfile = await readFile(lockfilePath, "utf8");
const encoded = gzipSync(Buffer.from(lockfile, "utf8"), { level: 9 }).toString("base64");
const chunkSize = 12000;
const chunks = Array.from({ length: Math.ceil(encoded.length / chunkSize) }, (_, index) =>
  encoded.slice(index * chunkSize, (index + 1) * chunkSize),
);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

await mkdir(publicDirectory, { recursive: true });
await Promise.all(
  chunks.map((chunk, index) =>
    writeFile(
      `${publicDirectory}/__veza_lock_${String(index).padStart(3, "0")}.txt`,
      chunk,
      "utf8",
    ),
  ),
);

await writeFile(
  `${publicDirectory}/__veza_lock_manifest.json`,
  `${JSON.stringify(
    {
      encoding: "gzip-base64",
      chunks: chunks.length,
      chunkSize,
      encodedLength: encoded.length,
      sha256: sha256(lockfile),
      encodedSha256: sha256(encoded),
      chunkSha256: chunks.map(sha256),
    },
    null,
    2,
  )}\n`,
  "utf8",
);
