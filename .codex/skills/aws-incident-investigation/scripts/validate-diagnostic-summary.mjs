import process from "node:process";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const FORBIDDEN_PATTERNS = [
  { kind: "email", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
  {
    kind: "jwt",
    pattern: /\b[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
  },
  {
    kind: "authorization_header",
    pattern: /\bAuthorization:\s*Bearer\s+[A-Za-z0-9._~+/=-]+\b/i,
  },
  {
    kind: "bearer_token",
    pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/i,
  },
];

export function validateDiagnosticSummary(input) {
  const value = typeof input === "string" ? JSON.parse(input) : input;
  const findings = [];

  walk(value, [], findings);

  return {
    ok: findings.length === 0,
    findings,
  };
}

function walk(value, path, findings) {
  if (typeof value === "string") {
    for (const entry of FORBIDDEN_PATTERNS) {
      if (entry.pattern.test(value)) {
        findings.push({
          path: path.join(".") || "<root>",
          kind: entry.kind,
        });
      }
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      walk(item, [...path, String(index)], findings),
    );
    return;
  }

  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      walk(nested, [...path, key], findings);
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const input = await readCliInput(process.argv[2]);
  const result = validateDiagnosticSummary(input);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

async function readCliInput(argument) {
  if (argument && argument !== "-") {
    if (argument.startsWith("@")) {
      return readFile(argument.slice(1), "utf8");
    }

    return argument;
  }

  if (!process.stdin.isTTY) {
    return new Promise((resolve, reject) => {
      let data = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => {
        data += chunk;
      });
      process.stdin.on("end", () => resolve(data || "{}"));
      process.stdin.on("error", reject);
    });
  }

  return "{}";
}
