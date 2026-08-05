import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
export const sourceRoot = join(packageRoot, "src");
export const readSource = (name) => readFile(join(sourceRoot, name), "utf8");
