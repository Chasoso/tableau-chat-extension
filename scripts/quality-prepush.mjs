import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const steps = [
  ["npm", ["run", "lint"]],
  ["npm", ["run", "typecheck"]],
  ["npm", ["run", "test:coverage"]],
  ["npm", ["run", "build"]],
  ["npm", ["run", "test:e2e"]],
];

main();

function main() {
  for (const [command, args] of steps) {
    run(command, args);
  }

  console.log("Pre-push quality gate passed.");
}

function run(command, args) {
  const result =
    process.platform === "win32" && command === "npm"
      ? spawnSync("cmd.exe", ["/d", "/s", "/c", "npm.cmd", ...args], {
          cwd: repoRoot,
          stdio: "inherit",
          env: { ...process.env, CI: process.env.CI ?? "true" },
        })
      : spawnSync(command, args, {
          cwd: repoRoot,
          stdio: "inherit",
          env: { ...process.env, CI: process.env.CI ?? "true" },
        });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
