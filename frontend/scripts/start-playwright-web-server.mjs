import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const viteBin = path.resolve(
  scriptDir,
  "..",
  "node_modules",
  "vite",
  "bin",
  "vite.js",
);
const child = spawn(process.execPath, [viteBin, "--host", "127.0.0.1"], {
  cwd: path.resolve(scriptDir, ".."),
  stdio: "inherit",
  env: {
    ...process.env,
    VITE_USE_MOCK_TABLEAU: "true",
    VITE_AUTH_REQUIRED: process.env.PW_VITE_AUTH_REQUIRED ?? "false",
    VITE_API_BASE_URL: "/api",
  },
});

let closing = false;

child.on("exit", (code, signal) => {
  if (closing) {
    return;
  }

  if (signal) {
    process.exitCode = 1;
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});

function shutdown(signal) {
  if (closing) {
    return;
  }

  closing = true;
  child.kill(signal);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
