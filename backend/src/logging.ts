import { createHash } from "node:crypto";

type LogLevel = "debug" | "info" | "warn" | "error";
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};
const SERVICE_NAME = "tableau-chat-extension";
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const JWT_PATTERN = /\b[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const JWT_SHAPE_PATTERN = /\b[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+\b/gi;

export function logInfo(
  event: string,
  details: Record<string, unknown> = {},
): void {
  writeLog("info", event, details);
}

export function logDebug(
  event: string,
  details: Record<string, unknown> = {},
): void {
  writeLog("debug", event, details);
}

export function logWarn(
  event: string,
  details: Record<string, unknown> = {},
): void {
  writeLog("warn", event, details);
}

export function logError(
  event: string,
  details: Record<string, unknown> = {},
): void {
  writeLog("error", event, details);
}

export function safeHash(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

export function safeErrorDetails(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { errorName: "UnknownError" };
  }

  const errorWithDetails = error as Error & { details?: unknown };
  const maybeDetails =
    errorWithDetails.details && typeof errorWithDetails.details === "object"
      ? (errorWithDetails.details as Record<string, unknown>)
      : undefined;

  return {
    errorName: error.name,
    errorMessage: sanitizeDiagnosticString(error.message),
    ...(maybeDetails
      ? { details: sanitizeDiagnosticObject(maybeDetails) }
      : {}),
  };
}

function writeLog(
  level: LogLevel,
  event: string,
  details: Record<string, unknown>,
): void {
  if (!shouldLog(level)) {
    return;
  }

  const payloadObject = {
    timestamp: new Date().toISOString(),
    level: level.toUpperCase(),
    service: SERVICE_NAME,
    environment: resolveEnvironment(),
    version: resolveVersion(),
    event,
    ...sanitizeDiagnosticObject(details),
  } as Record<string, unknown>;

  if (payloadObject.component === undefined) {
    const derivedComponent = deriveComponent(event);
    if (derivedComponent) {
      payloadObject.component = derivedComponent;
    }
  }

  if (payloadObject.operation === undefined) {
    const derivedOperation = deriveOperation(event);
    if (derivedOperation) {
      payloadObject.operation = derivedOperation;
    }
  }

  const payload = JSON.stringify(payloadObject);

  if (level === "error") {
    console.error(payload);
    return;
  }

  if (level === "warn") {
    console.warn(payload);
    return;
  }

  console.log(payload);
}

function shouldLog(level: LogLevel): boolean {
  const configuredLevel = resolveLogLevel(process.env.LOG_LEVEL);
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[configuredLevel];
}

function resolveLogLevel(value: string | undefined): LogLevel {
  if (!value) {
    return "info";
  }

  const normalized = value.trim().toLowerCase();
  if (
    normalized === "debug" ||
    normalized === "info" ||
    normalized === "warn" ||
    normalized === "error"
  ) {
    return normalized;
  }

  return "info";
}

function resolveEnvironment(): string {
  return (
    process.env.DEPLOYMENT_ENVIRONMENT ??
    process.env.APP_ENV ??
    process.env.NODE_ENV ??
    "unknown"
  );
}

function resolveVersion(): string {
  return (
    process.env.DEPLOYMENT_VERSION ??
    process.env.GIT_COMMIT_SHA ??
    process.env.AWS_LAMBDA_FUNCTION_VERSION ??
    "unknown"
  );
}

function deriveComponent(event: string): string | undefined {
  const [component] = event.split(".");
  return component?.trim() || undefined;
}

function deriveOperation(event: string): string | undefined {
  const [, ...segments] = event.split(".");
  const operation = segments.join(".");
  return operation.trim() || undefined;
}

function sanitizeDiagnosticObject(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const normalized = sanitizeDiagnosticValue(key, item);
    if (normalized !== undefined) {
      result[key] = normalized;
    }
  }
  return result;
}

function sanitizeDiagnosticValue(
  key: string,
  value: unknown,
): unknown | undefined {
  if (isSensitiveKey(key)) {
    return "[Redacted]";
  }

  if (typeof value === "string") {
    return sanitizeDiagnosticString(value);
  }

  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizeAnonymousDiagnosticValue(entry))
      .filter((entry) => entry !== undefined);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return sanitizeDiagnosticObject({
      name: value.name,
      message: sanitizeDiagnosticString(value.message),
    });
  }

  if (value && typeof value === "object") {
    return sanitizeDiagnosticObject(value as Record<string, unknown>);
  }

  return undefined;
}

function sanitizeAnonymousDiagnosticValue(value: unknown): unknown | undefined {
  if (typeof value === "string") {
    return sanitizeDiagnosticString(value);
  }

  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizeAnonymousDiagnosticValue(entry))
      .filter((entry) => entry !== undefined);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value && typeof value === "object") {
    return sanitizeDiagnosticObject(value as Record<string, unknown>);
  }

  return undefined;
}

function sanitizeDiagnosticString(value: string): string {
  if (!value) {
    return value;
  }

  if (looksLikeJwt(value) || looksLikeBearerToken(value)) {
    return "[Redacted]";
  }

  return value
    .replace(EMAIL_PATTERN, "[Redacted]")
    .replace(BEARER_PATTERN, "[Redacted]")
    .replace(JWT_PATTERN, "[Redacted]");
}

function looksLikeJwt(value: string): boolean {
  return JWT_SHAPE_PATTERN.test(value);
}

function looksLikeBearerToken(value: string): boolean {
  return value.startsWith("Bearer ") && value.length > "Bearer ".length + 10;
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    normalized === "authorization" ||
    normalized === "authorizationheader" ||
    normalized === "bearer" ||
    normalized === "token" ||
    normalized === "accesstoken" ||
    normalized === "refreshtoken" ||
    normalized === "idtoken" ||
    normalized.endsWith("token") ||
    normalized.includes("secret") ||
    normalized.includes("password") ||
    normalized.includes("cookie") ||
    normalized === "jwt" ||
    normalized === "email" ||
    normalized === "useremail" ||
    normalized === "tableauemail" ||
    normalized === "tableausubject" ||
    normalized === "subject" ||
    normalized === "raw" ||
    normalized === "rawbody" ||
    normalized === "rawresult" ||
    normalized === "rawmcpresult" ||
    normalized === "mcpresponse" ||
    normalized === "serverresponse" ||
    normalized === "transportrawresult" ||
    normalized === "stdout" ||
    normalized === "stderr" ||
    normalized === "stack" ||
    normalized === "stacktrace" ||
    normalized === "setcookie"
  );
}
