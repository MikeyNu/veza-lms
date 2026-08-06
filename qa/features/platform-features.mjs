import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const directory = join(dirname(fileURLToPath(import.meta.url)), "catalogue");
const files = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
const categories = [];
for (const name of files) {
  const value = JSON.parse(await readFile(join(directory, name), "utf8"));
  if (!Array.isArray(value.categories)) throw new Error(`Feature catalogue file ${name} is malformed`);
  categories.push(...value.categories);
}

export default {
  version: 1,
  architectureRules: [
    "Browser requests never provide a trusted tenant identifier.",
    "Tenant context is resolved from a validated membership and enforced again through PostgreSQL row-level security.",
    "Application, control-plane, worker and migration database identities remain separate.",
    "Consequential mutations are transactional and append audit and outbox evidence.",
    "Approved, published, released and issued records are immutable and corrected through superseding evidence.",
    "Privileged actions require explicit authorization and MFA assurance.",
    "Feature and entitlement evaluation is performed by trusted server-side code.",
    "Database recovery uses backup restoration followed by forward remediation.",
    "Browser surfaces use the shared Veza interface system and preserve accessible semantics."
  ],
  categories
};
