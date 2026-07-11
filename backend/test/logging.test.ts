import { afterEach, describe, expect, it, vi } from "vitest";
import { logInfo, safeErrorDetails } from "../src/logging";

const ENV_KEYS = [
  "LOG_LEVEL",
  "DEPLOYMENT_ENVIRONMENT",
  "DEPLOYMENT_VERSION",
  "APP_ENV",
  "NODE_ENV",
] as const;

const ORIGINAL_ENV = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]] as const),
);

afterEach(() => {
  vi.restoreAllMocks();

  for (const key of ENV_KEYS) {
    const value = ORIGINAL_ENV[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("logging", () => {
  it("emits a structured envelope and redacts sensitive values", () => {
    process.env.LOG_LEVEL = "info";
    process.env.DEPLOYMENT_ENVIRONMENT = "aws";
    process.env.DEPLOYMENT_VERSION = "commit-123";

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    logInfo("tableau.metadata.execution.completed", {
      requestId: "request-1",
      correlationId: "correlation-1",
      component: "tableau_metadata",
      operation: "describeDatasource",
      email: "user@example.com",
      authorization: "Bearer abc.def.ghi",
      nested: {
        subject: "user@example.com",
        rawResult: "abc.def.ghi",
      },
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(logSpy.mock.calls[0]?.[0] as string) as Record<
      string,
      unknown
    >;

    expect(payload.timestamp).toEqual(expect.any(String));
    expect(payload.level).toBe("INFO");
    expect(payload.service).toBe("tableau-chat-extension");
    expect(payload.environment).toBe("aws");
    expect(payload.version).toBe("commit-123");
    expect(payload.event).toBe("tableau.metadata.execution.completed");
    expect(payload.component).toBe("tableau_metadata");
    expect(payload.operation).toBe("describeDatasource");
    expect(payload.requestId).toBe("request-1");
    expect(payload.correlationId).toBe("correlation-1");
    expect(payload.email).toBe("[Redacted]");
    expect(payload.authorization).toBe("[Redacted]");

    const nested = payload.nested as Record<string, unknown>;
    expect(nested.subject).toBe("[Redacted]");
    expect(nested.rawResult).toBe("[Redacted]");

    const serialized = logSpy.mock.calls[0]?.[0] as string;
    expect(serialized).not.toContain("user@example.com");
    expect(serialized).not.toContain("abc.def.ghi");
  });

  it("redacts sensitive error details", () => {
    process.env.LOG_LEVEL = "info";

    const error = new Error("request failed for user@example.com");
    (error as Error & { details?: Record<string, unknown> }).details = {
      accessToken: "abc.def.ghi",
      email: "user@example.com",
      nested: {
        bearer: "Bearer abc.def.ghi",
      },
    };

    const details = safeErrorDetails(error);

    expect(details.errorMessage).not.toContain("user@example.com");
    expect(details.details).toMatchObject({
      accessToken: "[Redacted]",
      email: "[Redacted]",
      nested: {
        bearer: "[Redacted]",
      },
    });
  });
});
