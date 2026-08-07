import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const outputRoot = path.resolve(repoRoot, process.env.VEZA_SCREENSHOT_DIR ?? "artifacts/demo-screens");
const externalBaseUrl = process.env.VEZA_SCREENSHOT_BASE_URL?.replace(/\/$/, "");
const baseUrl = externalBaseUrl ?? "http://127.0.0.1:3100";

const screens = [
  { name: "learner-dashboard", path: "/", role: "learner" },
  { name: "my-learning", path: "/learning", role: "learner" },
  { name: "learner-calendar", path: "/calendar", role: "learner" },
  { name: "learner-progress", path: "/insights", role: "learner" },
];

const viewports = [
  { name: "reference", width: 1600, height: 900, deviceScaleFactor: 1 },
  { name: "desktop", width: 1440, height: 1024, deviceScaleFactor: 1 },
  { name: "tablet", width: 1024, height: 768, deviceScaleFactor: 1 },
  { name: "mobile", width: 390, height: 844, deviceScaleFactor: 2 },
];

function startDemoServer(role) {
  if (externalBaseUrl) return null;
  const child = spawn(
    "pnpm",
    ["--filter", "@veza/web", "dev", "--", "--hostname", "127.0.0.1", "--port", "3100"],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        VEZA_DEMO_MODE: "true",
        VEZA_DEMO_ROLE: role,
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout.on("data", (chunk) => process.stdout.write(`[web] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[web] ${chunk}`));
  return child;
}

async function waitForServer(url, timeoutMs = 120_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function stabilisePage(page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        caret-color: transparent !important;
      }
      html { scroll-behavior: auto !important; }
    `,
  });
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    const images = [...document.images];
    await Promise.all(images.map((image) => image.complete ? undefined : new Promise((resolve) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", resolve, { once: true });
    })));
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(250);
}

async function auditLayout(page, screen, viewport) {
  const report = await page.evaluate(() => {
    const root = document.documentElement;
    const overflowing = [...document.querySelectorAll("body *")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.right > root.clientWidth + 2 || rect.left < -2;
      })
      .slice(0, 20)
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        className: String(element.className ?? "").slice(0, 160),
        text: String(element.textContent ?? "").trim().slice(0, 100),
      }));
    return {
      title: document.title,
      viewportWidth: root.clientWidth,
      documentWidth: root.scrollWidth,
      viewportHeight: root.clientHeight,
      documentHeight: root.scrollHeight,
      overflowing,
    };
  });

  const reportPath = path.join(outputRoot, `${screen.name}-${viewport.name}.json`);
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  if (report.documentWidth > report.viewportWidth + 2) {
    throw new Error(`${screen.name} at ${viewport.name} has horizontal page overflow: ${report.documentWidth}px > ${report.viewportWidth}px`);
  }
}

async function captureRole(role, roleScreens) {
  const server = startDemoServer(role);
  try {
    await waitForServer(baseUrl);
    const browser = await chromium.launch({ headless: true });
    try {
      for (const viewport of viewports) {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          deviceScaleFactor: viewport.deviceScaleFactor,
          colorScheme: "light",
          locale: "en-ZA",
          timezoneId: "Africa/Johannesburg",
          reducedMotion: "reduce",
        });
        const page = await context.newPage();
        const consoleErrors = [];
        page.on("console", (message) => {
          if (message.type() === "error") consoleErrors.push(message.text());
        });
        page.on("pageerror", (error) => consoleErrors.push(error.message));

        for (const screen of roleScreens) {
          const url = `${baseUrl}${screen.path}`;
          const response = await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
          if (!response || response.status() >= 400) {
            throw new Error(`${screen.name} returned ${response?.status() ?? "no response"} at ${url}`);
          }
          await stabilisePage(page);
          await auditLayout(page, screen, viewport);
          const fileName = `${screen.name}-${viewport.name}-${viewport.width}x${viewport.height}.png`;
          await page.screenshot({
            path: path.join(outputRoot, fileName),
            fullPage: viewport.name !== "reference",
            animations: "disabled",
            scale: "device",
          });
        }

        if (consoleErrors.length > 0) {
          await fs.writeFile(
            path.join(outputRoot, `console-errors-${role}-${viewport.name}.txt`),
            `${consoleErrors.join("\n")}\n`,
          );
          throw new Error(`Browser console errors were recorded for ${role} at ${viewport.name}`);
        }
        await context.close();
      }
    } finally {
      await browser.close();
    }
  } finally {
    if (server) {
      server.kill("SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (!server.killed) server.kill("SIGKILL");
    }
  }
}

await fs.rm(outputRoot, { recursive: true, force: true });
await fs.mkdir(outputRoot, { recursive: true });

for (const role of [...new Set(screens.map((screen) => screen.role))]) {
  await captureRole(role, screens.filter((screen) => screen.role === role));
}

await fs.writeFile(
  path.join(outputRoot, "README.txt"),
  [
    "Veza demo screenshot capture",
    `Base URL: ${baseUrl}`,
    `Generated: ${new Date().toISOString()}`,
    "Each PNG is a separate capture. JSON files contain overflow and document-size QA evidence.",
    "The reference viewport is clipped to 1600x900 to make direct comparison with the approved references possible.",
  ].join("\n") + "\n",
);

console.log(`Captured ${screens.length * viewports.length} screenshots in ${outputRoot}`);
