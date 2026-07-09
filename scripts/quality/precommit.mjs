import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const backendRoot = path.join(repoRoot, "backend");
const frontendRoot = path.join(repoRoot, "frontend");
const secretScanScript = path.join(repoRoot, "scripts/quality/secret-scan.mjs");
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";

const prettierExtensions = new Set([
  ".css",
  ".html",
  ".json",
  ".js",
  ".jsx",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);

const eslintExtensions = new Set([
  ".cjs",
  ".js",
  ".jsx",
  ".mjs",
  ".ts",
  ".tsx",
]);

main();

function main() {
  const stagedFiles = getStagedFiles();

  if (stagedFiles.length === 0) {
    console.log("No staged files to check.");
    return;
  }

  runNode(secretScanScript, ["--staged"]);

  const prettierFiles = [];
  const eslintBackendFiles = [];
  const eslintFrontendFiles = [];

  for (const file of stagedFiles) {
    const normalized = normalizePath(file);

    if (isPrettierTarget(normalized)) {
      prettierFiles.push(relativeToWorkspace(frontendRoot, normalized));
    }

    if (isEslintTarget(normalized)) {
      const workspaceRoot = selectEslintWorkspace(normalized);
      const relativePath = relativeToWorkspace(workspaceRoot, normalized);
      if (workspaceRoot === frontendRoot) {
        eslintFrontendFiles.push(relativePath);
      } else {
        eslintBackendFiles.push(relativePath);
      }
    }
  }

  if (prettierFiles.length > 0) {
    runNpmBinary(frontendRoot, "prettier", ["--check", ...prettierFiles]);
  }

  if (eslintBackendFiles.length > 0) {
    runNpmBinary(backendRoot, "eslint", eslintBackendFiles);
  }

  if (eslintFrontendFiles.length > 0) {
    runNpmBinary(frontendRoot, "eslint", eslintFrontendFiles);
  }

  console.log(
    `Pre-commit quality checks passed for ${stagedFiles.length} staged file(s).`,
  );
}

function getStagedFiles() {
  const output = runCapture("git", [
    "diff",
    "--cached",
    "--name-only",
    "--diff-filter=ACMR",
    "-z",
  ]);

  return output
    .split("\0")
    .map((item) => item.trim())
    .filter(Boolean)
    .map(normalizePath);
}

function isPrettierTarget(filePath) {
  if (filePath.endsWith("package-lock.json")) {
    return false;
  }

  const extension = path.extname(filePath).toLowerCase();
  return prettierExtensions.has(extension) || filePath.endsWith("package.json");
}

function isEslintTarget(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return eslintExtensions.has(extension);
}

function selectEslintWorkspace(filePath) {
  if (filePath.startsWith("frontend/")) {
    return frontendRoot;
  }

  return backendRoot;
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/");
}

function relativeToWorkspace(workspaceRoot, filePath) {
  return normalizePath(
    path.relative(workspaceRoot, path.join(repoRoot, filePath)),
  );
}

function runNode(scriptPath, args) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runNpmBinary(cwd, binaryName, args) {
  const result =
    process.platform === "win32"
      ? spawnSync(
          "cmd.exe",
          ["/d", "/s", "/c", "npm.cmd", "exec", "--", binaryName, ...args],
          {
            cwd,
            stdio: "inherit",
            env: process.env,
          },
        )
      : spawnSync(npmExecutable, ["exec", "--", binaryName, ...args], {
          cwd,
          stdio: "inherit",
          env: process.env,
        });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runCapture(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
    maxBuffer: 1024 * 1024 * 10,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? "");
    process.exit(result.status ?? 1);
  }

  return result.stdout ?? "";
}
