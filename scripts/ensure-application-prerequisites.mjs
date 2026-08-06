import { readdir, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const workspaceRoot = fileURLToPath(new URL("../", import.meta.url));
const prerequisites = [
  {
    packageName: "@veza/contracts",
    sourcePaths: ["packages/contracts/src", "packages/contracts/package.json", "packages/contracts/tsconfig.json"],
    outputPath: "packages/contracts/dist/index.js",
  },
  {
    packageName: "@veza/oidc-bff",
    sourcePaths: ["packages/oidc-bff/src", "packages/oidc-bff/package.json", "packages/oidc-bff/tsconfig.json"],
    outputPath: "packages/oidc-bff/dist/index.js",
  },
  {
    packageName: "@veza/ui",
    sourcePaths: ["packages/ui/src", "packages/ui/package.json", "packages/ui/tsconfig.json"],
    outputPath: "packages/ui/dist/index.js",
  },
];

async function newestModification(targetPath) {
  const metadata = await stat(targetPath);
  if (!metadata.isDirectory()) return metadata.mtimeMs;
  const entries = await readdir(targetPath, { withFileTypes: true });
  const values = await Promise.all(
    entries.map((entry) => newestModification(path.join(targetPath, entry.name))),
  );
  return Math.max(metadata.mtimeMs, ...values);
}

async function outputIsCurrent(prerequisite) {
  const output = path.join(workspaceRoot, prerequisite.outputPath);
  try {
    const outputTime = (await stat(output)).mtimeMs;
    const sourceTimes = await Promise.all(
      prerequisite.sourcePaths.map((value) => newestModification(path.join(workspaceRoot, value))),
    );
    return outputTime >= Math.max(...sourceTimes);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

function buildPackage(packageName) {
  const executable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ["--filter", packageName, "build"], {
      cwd: workspaceRoot,
      env: process.env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${packageName} prerequisite build failed with ${signal ?? `exit code ${code}`}`));
    });
  });
}

for (const prerequisite of prerequisites) {
  if (!(await outputIsCurrent(prerequisite))) {
    process.stdout.write(`Building ${prerequisite.packageName} before the application build.\n`);
    await buildPackage(prerequisite.packageName);
  }
  if (!(await outputIsCurrent(prerequisite))) {
    throw new Error(`${prerequisite.packageName} did not produce a current ${prerequisite.outputPath}`);
  }
}
