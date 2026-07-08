import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

const mode = process.argv[2] ?? "--all";

if (!["--all", "--staged"].includes(mode)) {
  console.error("Usage: secret-scan.mjs [--all|--staged]");
  process.exit(1);
}

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
    kind: "content",
    pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/,
  },
  {
    label: "AWS access key",
    kind: "content",
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
  },
  {
    label: "GitHub token",
    kind: "content",
    pattern: /\bgh[pousr]_[A-Za-z0-9_]{36,}\b/,
  },
  {
    label: "JWT",
    kind: "content",
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  },
  {
    label: "secret-like assignment",
    kind: "line",
    pattern:
      /\b(?:client_secret|refresh_token|access_token|id_token|api_key|private_key|tableau_pat|direct_trust_secret|oauth_client_secret|connected_app_secret|password|secret_key|session_secret)\b\s*[:=]\s*['"]?([A-Za-z0-9+/=_-]{20,})['"]?/i,
  },
];

main();

function main() {
  const files = getFiles(mode);
  const findings = [];

  if (files.length === 0) {
    console.log("No files to scan.");
    return;
  }

  for (const file of files) {
    const normalized = normalizePath(file);
    if (shouldIgnore(normalized)) {
      continue;
    }

    const blockedPattern = blockedPathPatterns.find((pattern) =>
      pattern.test(normalized),
    );
    if (blockedPattern) {
      findings.push(
        `${normalized}: matches blocked secret-file pattern ${blockedPattern}`,
      );
      continue;
    }

    const content = readContent(mode, normalized);
    if (content === null || content.includes("\0")) {
      continue;
    }

    findings.push(...scanContent(normalized, content));
  }

  if (findings.length > 0) {
    console.error("Potential secret leaks detected:");
    for (const finding of findings) {
      console.error(`- ${finding}`);
    }
    process.exit(1);
  }

  console.log(
    `Secret scan passed for ${files.length} file(s) in ${mode === "--staged" ? "staged" : "tracked"} scope.`,
  );
}

function getFiles(scanMode) {
  const args =
    scanMode === "--staged"
      ? ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]
      : ["ls-files", "-z"];
  return runCapture("git", args)
    .split("\0")
    .map((file) => file.trim())
    .filter(Boolean)
    .map(normalizePath);
}

function readContent(scanMode, file) {
  if (scanMode === "--staged") {
    const result = spawnSync("git", ["show", `:${file}`], {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 10,
    });

    if (result.status !== 0) {
      return null;
    }

    return result.stdout ?? "";
  }

  try {
    return fs.readFileSync(path.join(repoRoot, file), "utf8");
  } catch {
    return null;
  }
}

function scanContent(file, content) {
  const findings = [];
  const lines = content.split(/\r?\n/);

  for (const secretPattern of secretPatterns) {
    if (!secretPattern.pattern.test(content)) {
      continue;
    }

    if (secretPattern.kind === "content") {
      findings.push(`${file}: contains ${secretPattern.label}`);
      continue;
    }

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (secretPattern.pattern.test(line)) {
        findings.push(
          `${file}:${index + 1}: contains ${secretPattern.label}: ${truncate(line.trim(), 120)}`,
        );
        break;
      }
    }
  }

  return findings;
}

function shouldIgnore(file) {
  return (
    file.startsWith(".git/") ||
    file.startsWith("node_modules/") ||
    file.startsWith("backend/coverage/") ||
    file.startsWith("backend/dist/") ||
    file.startsWith("frontend/coverage/") ||
    file.startsWith("frontend/dist/") ||
    file.startsWith("frontend/playwright-report/") ||
    file.startsWith("frontend/test-results/") ||
    file.startsWith("dist-lambda/")
  );
}

function normalizePath(file) {
  return file.replace(/\\/g, "/");
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
