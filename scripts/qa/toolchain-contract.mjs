import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const typescriptVersion = "6.0.2";

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

async function workspaceManifests() {
  const manifests = [join(repositoryRoot, "package.json")];
  for (const directory of ["apps", "packages"]) {
    for (const entry of await readdir(join(repositoryRoot, directory), { withFileTypes: true })) {
      if (entry.isDirectory()) manifests.push(join(repositoryRoot, directory, entry.name, "package.json"));
    }
  }
  return manifests;
}

const manifests = await workspaceManifests();
for (const manifestPath of manifests) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const declaredVersion = manifest.devDependencies?.typescript;
  invariant(
    declaredVersion === typescriptVersion,
    `${relative(repositoryRoot, manifestPath).split(sep).join("/")} must pin TypeScript ${typescriptVersion}`,
  );
}

const lockfile = await readFile(join(repositoryRoot, "pnpm-lock.yaml"), "utf8");
const lockedEntries = lockfile.match(/typescript:\r?\n\s+specifier: 6\.0\.2\r?\n\s+version: 6\.0\.2/g) ?? [];
invariant(
  lockedEntries.length >= manifests.length,
  `pnpm-lock.yaml must resolve TypeScript ${typescriptVersion} for every workspace manifest`,
);

process.stdout.write(`Toolchain contract validated: TypeScript ${typescriptVersion} is pinned in ${manifests.length} workspace manifests.\n`);
