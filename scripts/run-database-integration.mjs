import { spawn } from "node:child_process";

const composeFile = "docker-compose.integration.yml";
const environment = {
  ...process.env,
  MIGRATION_DATABASE_URL:
    "postgresql://veza_migrator:veza_migrator@127.0.0.1:55432/veza",
  DATABASE_URL: "postgresql://veza_app:veza_app@127.0.0.1:55432/veza",
  CONTROL_PLANE_DATABASE_URL:
    "postgresql://veza_control:veza_control@127.0.0.1:55432/veza",
  WORKER_DATABASE_URL:
    "postgresql://veza_worker:veza_worker@127.0.0.1:55432/veza",
};

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      ...options,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `${command} exited with ${code ?? signal ?? "unknown status"}`,
          ),
        );
    });
  });
}

let started = false;
try {
  await run("docker", [
    "compose",
    "-f",
    composeFile,
    "up",
    "-d",
    "--wait",
    "postgres-integration",
  ]);
  started = true;
  await run(process.execPath, ["apps/api/scripts/migrate.mjs"], {
    env: environment,
  });
  await run(
    process.execPath,
    ["--test", "apps/api/tests/integration/*.test.mjs"],
    { env: environment },
  );
} finally {
  if (started) {
    await run("docker", ["compose", "-f", composeFile, "down", "-v"], {
      env: environment,
    }).catch(() => {});
  }
}
