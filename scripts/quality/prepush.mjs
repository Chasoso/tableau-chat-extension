import path from "node:path";
import process from "node:process";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const secretScanScript = path.join(repoRoot, "scripts/quality/secret-scan.mjs");
const steps = [
  ["node", [secretScanScript, "--all"]],
  ["npm", ["run", "lint"]],
  ["npm", ["run", "typecheck"]],
  ["npm", ["run", "test:coverage"]],
  ["npm", ["run", "build"]],
];

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

async function main() {
  for (const [command, args] of steps) {
    run(command, args);
  }

  await runPlaywrightE2E();

  console.log("Pre-push quality gate passed.");
}

function run(command, args, extraEnv = {}) {
  const env = {
    ...process.env,
    CI: process.env.CI ?? "true",
    ...extraEnv,
  };
  const result =
    process.platform === "win32" && command === "npm"
      ? spawnSync("cmd.exe", ["/d", "/s", "/c", "npm.cmd", ...args], {
          cwd: repoRoot,
          stdio: "inherit",
          env,
        })
      : spawnSync(command, args, {
          cwd: repoRoot,
          stdio: "inherit",
          env,
        });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function runPlaywrightE2E() {
  const server = spawn(
    process.execPath,
    [
      path.join(repoRoot, "frontend", "node_modules", "vite", "bin", "vite.js"),
      "--host",
      "127.0.0.1",
    ],
    {
      cwd: path.join(repoRoot, "frontend"),
      stdio: "ignore",
      windowsHide: true,
      env: {
        ...process.env,
        VITE_USE_MOCK_TABLEAU: "true",
        VITE_AUTH_REQUIRED: process.env.PW_VITE_AUTH_REQUIRED ?? "false",
        VITE_API_BASE_URL: "/api",
      },
    },
  );

  server.unref();

  try {
    await waitForUrl("http://127.0.0.1:5173");
    run("npm", ["run", "test:e2e"], {
      PLAYWRIGHT_SKIP_WEB_SERVER: "1",
      PLAYWRIGHT_BASE_URL: "http://127.0.0.1:5173",
    });
  } finally {
    stopProcessTree(server.pid);
  }
}

async function waitForUrl(url) {
  const timeoutMs = 120_000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { method: "GET" });
      if (response.ok || response.status === 404) {
        return;
      }
    } catch {
      // Keep waiting until Vite is ready.
    }

    await delay(1_000);
  }

  throw new Error(`Timed out waiting for Playwright server at ${url}`);
}

function stopProcessTree(pid) {
  if (!pid) {
    return;
  }

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/t", "/f"], {
      stdio: "ignore",
    });
    return;
  }

  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Ignore cleanup failures; the process is no longer needed.
    }
  }
}
