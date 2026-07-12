import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getConfig } from "../config";
import { getTableauConnectedAppSecrets } from "../aws/secrets";
import { logError, logInfo, logWarn } from "../logging";
import { generateTableauConnectedAppJwt } from "../tableau/tableauAuth";
import type { AuthenticatedUser } from "../types/auth";
import type { JsonObject } from "./types";
import type {
  TableauMcpTransport,
  TableauMcpTransportError,
} from "./tableauMetadataToolRuntime";
import {
  createHostedTableauMcpTransport,
  type HostedMcpRequestClient,
  type HostedMcpRequestClientResult,
} from "./hostedTableauMcpTransport";
import { normalizeHostedMcpMetadataErrorCode } from "./hostedMcpMetadataErrorNormalizer";

type HostedMetadataDiscoveryTransportConfig = {
  enabled: boolean;
  endpoint?: string;
  timeoutMs?: number;
  siteId?: string;
  siteContentUrl?: string;
};

export function createHostedMetadataDiscoveryTransport(
  input: {
    authenticatedUser?: AuthenticatedUser;
    tableauSubject?: string;
    requestId?: string;
    correlationId?: string;
    agentRunId?: string;
  } = {},
): TableauMcpTransport | undefined {
  const config = getConfig().tableau.hostedMcp;
  if (!config.enabled) {
    return undefined;
  }

  const transportConfig: HostedMetadataDiscoveryTransportConfig = {
    enabled: config.enabled,
    endpoint: config.endpoint,
    timeoutMs: config.timeoutMs,
    siteId: config.siteId,
    siteContentUrl: config.siteContentUrl,
  };

  return createHostedTableauMcpTransport(
    {
      endpoint: transportConfig.endpoint,
      timeoutMs: transportConfig.timeoutMs,
      siteId: transportConfig.siteId,
      siteContentUrl: transportConfig.siteContentUrl,
      networkEnabled: true,
      protocol: "streamable_http",
      authMode: "direct_trust",
    },
    {
      requestClient:
        isNonEmptyString(transportConfig.endpoint) && isConnectedAppAvailable()
          ? createHostedMetadataDiscoveryRequestClient({
              endpoint: transportConfig.endpoint,
              timeoutMs: transportConfig.timeoutMs,
              siteId: transportConfig.siteId,
              siteContentUrl: transportConfig.siteContentUrl,
              authenticatedUser: input.authenticatedUser,
              tableauSubject: input.tableauSubject,
              requestId: input.requestId,
              correlationId: input.correlationId,
              agentRunId: input.agentRunId,
            })
          : undefined,
    },
  );
}

function createHostedMetadataDiscoveryRequestClient(input: {
  endpoint: string;
  timeoutMs?: number;
  siteId?: string;
  siteContentUrl?: string;
  authenticatedUser?: AuthenticatedUser;
  tableauSubject?: string;
  requestId?: string;
  correlationId?: string;
  agentRunId?: string;
}): HostedMcpRequestClient {
  return async (request) => {
    const startedAt = new Date();
    const operation = "describeDatasource";
    const subject =
      request.userContext?.tableauUserId ??
      request.userContext?.email ??
      input.tableauSubject ??
      input.authenticatedUser?.tableauSubject ??
      input.authenticatedUser?.email;

    logInfo("hosted.metadata.transport.started", {
      component: "hosted_metadata_transport",
      operation,
      requestId: request.requestId,
      correlationId: request.correlationId,
      agentRunId: request.agentRunId,
      transportKind: "hosted",
      endpointConfigured: true,
      siteConfigured: Boolean(input.siteId || input.siteContentUrl),
      authMode: "direct_trust",
      result: "started",
      retryCount: 0,
    });

    if (!subject) {
      const result = buildNotConfiguredClientResult(
        "A Tableau subject is required for Direct Trust authentication.",
        request,
      );
      logWarn("hosted.metadata.transport.not_configured", {
        component: "hosted_metadata_transport",
        operation,
        requestId: request.requestId,
        correlationId: request.correlationId,
        agentRunId: request.agentRunId,
        transportKind: "hosted",
        result: "failure",
        errorCode: result.error.code,
        retryCount: 0,
      });
      return result;
    }

    let connectedApp;
    try {
      connectedApp = getTableauConnectedAppSecrets();
    } catch {
      const result = buildNotConfiguredClientResult(
        "Tableau Connected App secrets are not configured.",
        request,
      );
      logWarn("hosted.metadata.transport.not_configured", {
        component: "hosted_metadata_transport",
        operation,
        requestId: request.requestId,
        correlationId: request.correlationId,
        agentRunId: request.agentRunId,
        transportKind: "hosted",
        result: "failure",
        errorCode: result.error.code,
        retryCount: 0,
      });
      return result;
    }

    const jwt = generateTableauConnectedAppJwt({
      connectedApp,
      subject,
      scopes: [],
    });

    const transport = new StreamableHTTPClientTransport(
      new URL(input.endpoint),
      {
        requestInit: {
          headers: {
            Authorization: `Bearer ${jwt}`,
          },
        },
      },
    );
    const client = new Client({
      name: "tableau-chat-extension-hosted-mcp-client",
      version: "0.1.0",
    });

    try {
      await client.connect(transport);
      const rawResult = await client.callTool({
        name: request.toolName,
        arguments: request.input,
      });

      if (isMcpErrorResult(rawResult)) {
        const result: HostedMcpRequestClientResult = {
          status: "failed",
          error: buildTransportError({
            toolName: request.toolName,
            operation,
            transportKind: "hosted",
            message: summarizeMcpToolResult(rawResult),
            reason: "Hosted MCP tool returned an error result.",
          }),
          warnings: [],
          metadata: buildClientMetadata(request, input, subject),
        };
        const errorCode = result.error?.code ?? "UNKNOWN_ERROR";
        logWarn("hosted.metadata.transport.failed", {
          component: "hosted_metadata_transport",
          operation,
          requestId: request.requestId,
          correlationId: request.correlationId,
          agentRunId: request.agentRunId,
          transportKind: "hosted",
          result: "failure",
          errorCode,
          durationMs: Math.max(0, Date.now() - startedAt.getTime()),
          retryCount: 0,
        });
        return result;
      }

      const result: HostedMcpRequestClientResult = {
        status: "success",
        data: parseHostedToolResult(rawResult),
        metadata: buildClientMetadata(request, input, subject),
      };
      logInfo("hosted.metadata.transport.completed", {
        component: "hosted_metadata_transport",
        operation,
        requestId: request.requestId,
        correlationId: request.correlationId,
        agentRunId: request.agentRunId,
        transportKind: "hosted",
        result: "success",
        durationMs: Math.max(0, Date.now() - startedAt.getTime()),
        retryCount: 0,
      });
      return result;
    } catch (error) {
      const result: HostedMcpRequestClientResult = {
        status: "failed",
        error: buildTransportError({
          toolName: request.toolName,
          operation,
          transportKind: "hosted",
          message: error instanceof Error ? error.message : String(error),
          reason: "Hosted MCP request failed.",
        }),
        metadata: buildClientMetadata(request, input, subject),
      };
      const errorCode = result.error?.code ?? "UNKNOWN_ERROR";
      logError("hosted.metadata.transport.failed", {
        component: "hosted_metadata_transport",
        operation,
        requestId: request.requestId,
        correlationId: request.correlationId,
        agentRunId: request.agentRunId,
        transportKind: "hosted",
        result: "failure",
        errorCode,
        durationMs: Math.max(0, Date.now() - startedAt.getTime()),
        retryCount: 0,
      });
      return result;
    } finally {
      await transport.close().catch(() => undefined);
    }
  };
}

function buildClientMetadata(
  request: {
    requestId: string;
    toolName: string;
    correlationId?: string;
    agentRunId?: string;
  },
  input: {
    endpoint: string;
    timeoutMs?: number;
    siteId?: string;
    siteContentUrl?: string;
  },
  subject: string,
): JsonObject {
  return {
    source: "hosted_metadata_discovery_transport",
    requestId: request.requestId,
    toolName: request.toolName,
    endpointConfigured: true,
    subjectHash: hashString(subject),
    ...(request.correlationId ? { correlationId: request.correlationId } : {}),
    ...(request.agentRunId ? { agentRunId: request.agentRunId } : {}),
    ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
    ...(input.siteId ? { siteId: input.siteId } : {}),
    ...(input.siteContentUrl ? { siteContentUrl: input.siteContentUrl } : {}),
  };
}

function buildNotConfiguredClientResult(
  reason: string,
  request: {
    requestId: string;
    toolName: string;
    correlationId?: string;
    agentRunId?: string;
  },
): {
  status: "not_configured";
  error: {
    code: "TRANSPORT_NOT_CONFIGURED";
    message: string;
    retryable: false;
    userActionRequired: true;
    source: string;
    metadata: JsonObject;
  };
  metadata: JsonObject;
} {
  return {
    status: "not_configured",
    error: {
      code: "TRANSPORT_NOT_CONFIGURED",
      message: reason,
      retryable: false,
      userActionRequired: true,
      source: "hosted_metadata_discovery_transport",
      metadata: {
        reason,
      },
    },
    metadata: {
      source: "hosted_metadata_discovery_transport",
      requestId: request.requestId,
      toolName: request.toolName,
      ...(request.correlationId
        ? { correlationId: request.correlationId }
        : {}),
      ...(request.agentRunId ? { agentRunId: request.agentRunId } : {}),
    },
  };
}

function buildTransportError(input: {
  toolName: string;
  operation: "describeDatasource";
  transportKind: "hosted";
  message: string;
  reason: string;
}): TableauMcpTransportError {
  const normalizedCode = normalizeHostedMcpMetadataErrorCode({
    transportKind: input.transportKind,
    message: input.message,
    reason: input.reason,
  });
  const code = mapMetadataErrorCodeToTransportErrorCode(normalizedCode);
  return {
    code,
    message: safeTransportErrorMessage(code),
    retryable: isRetryableTransportErrorCode(code),
    userActionRequired: isUserActionRequiredTransportErrorCode(code),
    source: "hosted_metadata_discovery_transport",
    metadata: {
      source: "hosted_metadata_discovery_transport",
      normalizedCode,
      toolName: input.toolName,
      operation: input.operation,
      transportKind: input.transportKind,
    },
  };
}

function parseHostedToolResult(result: unknown): unknown {
  const text = extractTextFromMcpToolResult(result);
  if (!text) {
    return result;
  }

  const parsed = tryParseJson(text);
  return parsed ?? result;
}

function extractTextFromMcpToolResult(result: unknown): string {
  if (!result || typeof result !== "object") {
    return "";
  }

  const record = result as Record<string, unknown>;
  if (!Array.isArray(record.content)) {
    return "";
  }

  return record.content
    .map((content) => {
      if (!content || typeof content !== "object") {
        return "";
      }

      const contentRecord = content as Record<string, unknown>;
      return typeof contentRecord.text === "string" ? contentRecord.text : "";
    })
    .filter(Boolean)
    .join("\n");
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isMcpErrorResult(result: unknown): boolean {
  return Boolean(
    result &&
    typeof result === "object" &&
    "isError" in result &&
    (result as { isError?: unknown }).isError === true,
  );
}

function summarizeMcpToolResult(result: unknown): string {
  const text = extractTextFromMcpToolResult(result) || JSON.stringify(result);
  return text.length > 1_000 ? `${text.slice(0, 1_000)}...` : text;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isConnectedAppAvailable(): boolean {
  try {
    getTableauConnectedAppSecrets();
    return true;
  } catch {
    return false;
  }
}

function mapMetadataErrorCodeToTransportErrorCode(
  code: string,
): TableauMcpTransportError["code"] {
  switch (code) {
    case "INVALID_INPUT":
    case "MISSING_REQUIRED_IDENTIFIER":
      return "INVALID_TOOL_INPUT";
    case "TRANSPORT_FAILED":
      return "REMOTE_SERVER_ERROR";
    case "AUTH_REQUIRED":
    case "AUTH_EXPIRED":
    case "PERMISSION_DENIED":
    case "SITE_SETTINGS_DISABLED":
    case "TRANSPORT_NOT_CONFIGURED":
    case "NETWORK_ERROR":
    case "TIMEOUT":
    case "MCP_PROTOCOL_ERROR":
    case "TOOL_NOT_FOUND":
    case "REMOTE_SERVER_ERROR":
      return code;
    case "UNKNOWN_ERROR":
    default:
      return "UNKNOWN_ERROR";
  }
}

function isRetryableTransportErrorCode(
  code: TableauMcpTransportError["code"],
): boolean {
  return (
    code === "AUTH_REQUIRED" ||
    code === "AUTH_EXPIRED" ||
    code === "NETWORK_ERROR" ||
    code === "TIMEOUT" ||
    code === "REMOTE_SERVER_ERROR"
  );
}

function isUserActionRequiredTransportErrorCode(
  code: TableauMcpTransportError["code"],
): boolean {
  return !(
    code === "NETWORK_ERROR" ||
    code === "TIMEOUT" ||
    code === "REMOTE_SERVER_ERROR"
  );
}

function safeTransportErrorMessage(
  code: TableauMcpTransportError["code"],
): string {
  switch (code) {
    case "AUTH_REQUIRED":
      return "Hosted Tableau MCP authentication is required.";
    case "AUTH_EXPIRED":
      return "Hosted Tableau MCP authentication has expired.";
    case "PERMISSION_DENIED":
      return "Hosted Tableau MCP permission is denied.";
    case "TRANSPORT_NOT_CONFIGURED":
      return "Hosted Tableau MCP is not configured.";
    case "NETWORK_ERROR":
      return "Hosted Tableau MCP could not be reached.";
    case "TIMEOUT":
      return "Hosted Tableau MCP timed out.";
    case "MCP_PROTOCOL_ERROR":
      return "Hosted Tableau MCP returned an invalid protocol response.";
    case "TOOL_NOT_FOUND":
      return "The requested Hosted Tableau MCP tool was not found.";
    case "INVALID_TOOL_INPUT":
      return "Hosted Tableau MCP rejected the tool input.";
    case "REMOTE_SERVER_ERROR":
      return "Hosted Tableau MCP returned a server error.";
    case "SITE_SETTINGS_DISABLED":
      return "Hosted Tableau MCP is disabled for this site.";
    case "UNKNOWN_ERROR":
    default:
      return "Hosted Tableau MCP failed unexpectedly.";
  }
}

function hashString(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(16);
}
