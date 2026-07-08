import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const backendRoot = path.join(repoRoot, "backend");
const frontendRoot = path.join(repoRoot, "frontend");
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

const blockedPathPatterns = [
  /(^|\/)\.env(\.[^/]+)?$/i,
  /(^|\/)\.env\.[^/]+\.local$/i,
  /(^|\/).*\.(?:pem|p12|pfx|key)$/i,
  /(^|\/)(?:id_rsa|id_dsa)(?:\.pub)?$/i,
  /(^|\/).*(?:credential|credentials|secret|secrets|token|private).*\.json$/i,
];

const secretPatterns = [
  {
    label: "private key block",
    pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/,
  },
  {
    label: "AWS access key",
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
  },
  {
    label: "GitHub token",
    pattern: /\bgh[pousr]_[A-Za-z0-9_]{36,}\b/,
  },
  {
    label: "JWT",
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  },
  {
    label: "secret-like assignment",
    pattern:
      /\b(?:client_secret|refresh_token|access_token|id_token|api_key|private_key|tableau_pat|direct_trust_secret|oauth_client_secret|connected_app_secret)\b\s*[:=]\s*['"]?([A-Za-z0-9+/=_-]{20,})['"]?/i,
  },
];

main();

function main() {
  const stagedFiles = getStagedFiles();

  if (stagedFiles.length === 0) {
    console.log("No staged files to check.");
    return;
  }

  const blockedFiles = [];
  const secretFindings = [];
  const prettierFiles = [];
  const eslintBackendFiles = [];
  const eslintFrontendFiles = [];

  for (const file of stagedFiles) {
    if (shouldIgnore(file)) {
      continue;
    }

    const normalized = normalizePath(file);
    const blockedPattern = blockedPathPatterns.find((pattern) =>
      pattern.test(normalized),
    );

    if (blockedPattern) {
      blockedFiles.push(
        `${file} matches blocked secret-file pattern ${blockedPattern}`,
      );
      continue;
    }

    const text = readStagedFile(file);
    if (text === null) {
      continue;
    }

    secretFindings.push(...scanSecrets(file, text));

    if (isPrettierTarget(file)) {
      prettierFiles.push(file);
    }

    if (isEslintTarget(file)) {
      if (isFrontendPath(file)) {
        eslintFrontendFiles.push(relativeToWorkspace(frontendRoot, file));
      } else if (isBackendPath(file)) {
        eslintBackendFiles.push(relativeToWorkspace(backendRoot, file));
      }
    }
  }

  const failures = [];

  if (blockedFiles.length > 0) {
    failures.push(
      "Blocked secret-like file paths:\n" +
        blockedFiles.map((item) => `- ${item}`).join("\n"),
    );
  }

  if (secretFindings.length > 0) {
    failures.push(
      "Potential secret leaks detected:\n" +
        secretFindings.map((item) => `- ${item}`).join("\n"),
    );
  }

  if (prettierFiles.length > 0) {
    runNpmBinary(backendRoot, "prettier", [
      "--check",
      ...prettierFiles.map((file) => relativeToWorkspace(backendRoot, file)),
    ]);
  }

  if (eslintBackendFiles.length > 0) {
    runNpmBinary(backendRoot, "eslint", eslintBackendFiles);
  }

  if (eslintFrontendFiles.length > 0) {
    runNpmBinary(frontendRoot, "eslint", eslintFrontendFiles);
  }

  if (failures.length > 0) {
    console.error(failures.join("\n\n"));
    process.exit(1);
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

function readStagedFile(filePath) {
  const output = spawnSync("git", ["show", `:${filePath}`], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 10,
  });

  if (output.status !== 0) {
    return null;
  }

  return output.stdout ?? "";
}

function scanSecrets(filePath, content) {
  const findings = [];
  const lines = content.split(/\r?\n/);

  for (const pattern of secretPatterns) {
    if (!pattern.pattern.test(content)) {
      continue;
    }

    if (pattern.label === "private key block") {
      findings.push(`${filePath}: contains ${pattern.label}`);
      continue;
    }

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (pattern.pattern.test(line)) {
        findings.push(
          `${filePath}:${index + 1}: contains ${pattern.label}: ${truncate(line.trim(), 120)}`,
        );
        break;
      }
    }
  }

  return findings;
}

function isPrettierTarget(filePath) {
  const normalized = normalizePath(filePath);
  if (normalized.endsWith("package-lock.json")) {
    return false;
  }

  const extension = path.extname(normalized).toLowerCase();
  return prettierExtensions.has(extension) || normalized === "package.json";
}

function isEslintTarget(filePath) {
  const extension = path.extname(normalizePath(filePath)).toLowerCase();
  return eslintExtensions.has(extension);
}

function isBackendPath(filePath) {
  return normalizePath(filePath).startsWith("backend/");
}

function isFrontendPath(filePath) {
  return normalizePath(filePath).startsWith("frontend/");
}

function relativeToWorkspace(workspaceRoot, filePath) {
  return normalizePath(
    path.relative(workspaceRoot, path.join(repoRoot, filePath)),
  );
}

function shouldIgnore(filePath) {
  const normalized = normalizePath(filePath);
  return (
    normalized.startsWith(".git/") || normalized.startsWith("node_modules/")
  );
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/");
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

function truncate(text, length) {
  if (text.length <= length) {
    return text;
  }

  return `${text.slice(0, length - 3)}...`;
}
