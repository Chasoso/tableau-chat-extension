import { describe, expect, it } from "vitest";
import { normalizeHostedMcpMetadataError } from "../src/agent";

describe("Hosted MCP metadata error normalization", () => {
  it.each([
    [
      "AUTH_REQUIRED",
      {
        code: "AUTH_REQUIRED",
        message: "raw auth required message should not leak",
      },
    ],
    [
      "AUTH_EXPIRED",
      {
        code: "AUTH_EXPIRED",
        message: "raw auth expired message should not leak",
      },
    ],
    [
      "PERMISSION_DENIED",
      {
        code: "PERMISSION_DENIED",
        message: "raw permission denied message should not leak",
      },
    ],
    [
      "SITE_SETTINGS_DISABLED",
      {
        code: "SITE_SETTINGS_DISABLED",
        message: "raw site settings message should not leak",
      },
    ],
    [
      "TRANSPORT_NOT_CONFIGURED",
      {
        transportStatus: "not_configured",
        message: "endpoint missing should not leak raw details",
      },
    ],
    [
      "NETWORK_ERROR",
      {
        code: "NETWORK_ERROR",
        message: "dns failure should not leak",
      },
    ],
    [
      "TIMEOUT",
      {
        code: "TIMEOUT",
        message: "request timed out should not leak",
      },
    ],
    [
      "MCP_PROTOCOL_ERROR",
      {
        code: "MCP_PROTOCOL_ERROR",
        message: "malformed json should not leak",
      },
    ],
    [
      "TOOL_NOT_FOUND",
      {
        code: "TOOL_NOT_FOUND",
        message: "unknown tool should not leak",
      },
    ],
    [
      "INVALID_INPUT",
      {
        code: "INVALID_TOOL_INPUT",
        message: "invalid input should not leak",
      },
    ],
    [
      "REMOTE_SERVER_ERROR",
      {
        code: "REMOTE_SERVER_ERROR",
        message: "upstream 503 should not leak",
      },
    ],
    [
      "UNKNOWN_ERROR",
      {
        code: "something-new",
        message: "unexpected secret token=abc123 should not leak",
      },
    ],
  ] as const)("maps %s into a safe summary", (expectedCode, input) => {
    const result = normalizeHostedMcpMetadataError({
      toolName: "tableau.metadata.describeDatasource",
      operation: "describeDatasource",
      transportKind: "hosted",
      transportStatus: "failed",
      requestId: "request-1",
      correlationId: "corr-1",
      agentRunId: "agent-1",
      ...input,
    });

    expect(result).toMatchObject({
      code: expectedCode,
      message: expect.any(String),
      metadata: expect.objectContaining({
        source: "hosted_mcp_metadata_error_normalizer",
        normalizedCode: expectedCode,
        toolName: "tableau.metadata.describeDatasource",
        operation: "describeDatasource",
        transportKind: "hosted",
        requestId: "request-1",
        correlationId: "corr-1",
        agentRunId: "agent-1",
      }),
    });
    expect(JSON.stringify(result)).not.toContain("should not leak");
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain("abc123");
    expect(JSON.stringify(result)).not.toContain("token=");
  });

  it("keeps the summary JSON-safe", () => {
    const result = normalizeHostedMcpMetadataError({
      code: "NETWORK_ERROR",
      message: "dns failure",
      toolName: "tableau.metadata.listFields",
      operation: "listFields",
      transportKind: "remote",
      transportStatus: "failed",
      requestId: "request-json-safe",
      correlationId: "corr-json-safe",
      agentRunId: "agent-json-safe",
    });

    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(result.retryable).toBe(true);
    expect(result.userActionRequired).toBe(false);
  });
});
