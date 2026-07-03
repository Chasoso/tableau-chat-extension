import type { JsonObject } from "./types";
import type {
  TableauMcpTransport,
  TableauMcpTransportError,
  TableauMcpTransportRequest,
  TableauMcpTransportResult,
  TableauMcpTransportStatus,
  TableauMcpTransportTiming,
  TableauMcpTransportTraceMetadata,
  TableauMcpTransportWarning,
  TableauMcpTransportKind,
} from "./tableauMetadataToolRuntime";
import {
  TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME,
  TABLEAU_METADATA_LIST_FIELDS_TOOL_NAME,
} from "./tableauMetadataTools";

export type HostedTableauMcpTransportProtocol =
  | "streamable_http"
  | "sse"
  | "unknown";

export type HostedTableauMcpTransportAuthMode =
  | "oauth_delegated"
  | "token_reference"
  | "unknown";

export type HostedTableauMcpTransportConfig = {
  endpoint?: string;
  authMode?: HostedTableauMcpTransportAuthMode;
  tokenReference?: string;
  siteId?: string;
  siteContentUrl?: string;
  timeoutMs?: number;
  networkEnabled?: boolean;
  protocol?: HostedTableauMcpTransportProtocol;
  siteContextRequired?: boolean;
  metadata?: JsonObject;
};

export type HostedTableauMcpTransportDependencies = {
  now?: () => Date;
  requestClient?: HostedMcpRequestClient;
  logger?: HostedTableauMcpTransportLogger;
};

export type HostedMcpRequestClientResult =
  | {
      status: "success" | "partial";
      data?: unknown;
      warnings?: readonly TableauMcpTransportWarning[];
      trace?: Partial<TableauMcpTransportTraceMetadata>;
      metadata?: JsonObject;
    }
  | {
      status: "unsupported" | "timeout" | "failed" | "not_configured";
      error?: TableauMcpTransportError;
      warnings?: readonly TableauMcpTransportWarning[];
      trace?: Partial<TableauMcpTransportTraceMetadata>;
      metadata?: JsonObject;
    };

export type HostedMcpRequestClient = (
  request: TableauMcpTransportRequest,
) => Promise<HostedMcpRequestClientResult>;

export type HostedTableauMcpTransportLogger = {
  debug?: (message: string, metadata?: JsonObject) => void;
  info?: (message: string, metadata?: JsonObject) => void;
  warn?: (message: string, metadata?: JsonObject) => void;
  error?: (message: string, metadata?: JsonObject) => void;
};

type HostedTableauMcpTransportAuthState =
  TableauMcpTransportRequest["authContext"] extends {
    state?: infer S;
  }
    ? S
    :
        | "ready"
        | "missing"
        | "expired"
        | "unknown"
        | "not_configured"
        | undefined;

const HOSTED_TOOL_ALLOWLIST = new Set([
  TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME,
  TABLEAU_METADATA_LIST_FIELDS_TOOL_NAME,
]);

export class HostedTableauMcpTransport implements TableauMcpTransport {
  readonly kind: TableauMcpTransportKind = "hosted";
  readonly name = "hosted-tableau-mcp-transport";

  constructor(
    private readonly config: HostedTableauMcpTransportConfig = {},
    private readonly dependencies: HostedTableauMcpTransportDependencies = {},
  ) {}

  async call(
    request: TableauMcpTransportRequest,
  ): Promise<TableauMcpTransportResult> {
    const now = this.dependencies.now ?? (() => new Date());
    const startedAt = now();
    const timeoutMs = normalizeTimeoutMs(
      request.timeoutMs ?? this.config.timeoutMs,
    );
    const endpointConfigured = isNonEmptyString(this.config.endpoint);
    const authConfigured = isAuthConfigured(
      this.config,
      request.authContext?.state,
    );
    const siteConfigured = isSiteConfigured(this.config);
    const requestClientConfigured = Boolean(this.dependencies.requestClient);
    const networkEnabled = this.config.networkEnabled === true;
    const protocol = this.config.protocol ?? "unknown";
    const safeMetadata = buildSafeMetadata({
      request,
      endpointConfigured,
      authConfigured,
      siteConfigured,
      requestClientConfigured,
      networkEnabled,
      protocol,
    });

    if (!HOSTED_TOOL_ALLOWLIST.has(request.toolName)) {
      return buildUnsupportedResult({
        request,
        startedAt,
        timeoutMs,
        message: `Tool '${request.toolName}' is not supported by the Hosted Tableau MCP transport skeleton.`,
        metadata: safeMetadata,
      });
    }

    if (timeoutMs === undefined) {
      return buildNotConfiguredResult({
        request,
        startedAt,
        timeoutMs: this.config.timeoutMs,
        reason: "Invalid or missing timeout configuration.",
        metadata: safeMetadata,
      });
    }

    if (!endpointConfigured) {
      return buildNotConfiguredResult({
        request,
        startedAt,
        timeoutMs,
        reason: "Hosted endpoint is not configured.",
        metadata: safeMetadata,
      });
    }

    if (!authConfigured) {
      const authReason =
        request.authContext?.state === "missing"
          ? "Hosted auth is missing."
          : request.authContext?.state === "expired"
            ? "Hosted auth has expired."
            : request.authContext?.state === "not_configured"
              ? "Hosted auth is not configured."
              : "Hosted auth is not configured.";
      return buildNotConfiguredResult({
        request,
        startedAt,
        timeoutMs,
        reason: authReason,
        metadata: safeMetadata,
      });
    }

    if (this.config.siteContextRequired === true && !siteConfigured) {
      return buildNotConfiguredResult({
        request,
        startedAt,
        timeoutMs,
        reason: "Hosted site context is not configured.",
        metadata: safeMetadata,
      });
    }

    if (!networkEnabled) {
      return buildNotConfiguredResult({
        request,
        startedAt,
        timeoutMs,
        reason: "Hosted network access is disabled.",
        metadata: safeMetadata,
      });
    }

    if (!this.dependencies.requestClient) {
      return buildNotConfiguredResult({
        request,
        startedAt,
        timeoutMs,
        reason: "Hosted request client is not configured.",
        metadata: safeMetadata,
      });
    }

    try {
      const clientResult = await this.dependencies.requestClient(request);
      const completedAt = now();
      return normalizeClientResult({
        request,
        startedAt,
        completedAt,
        timeoutMs,
        clientResult,
        metadata: safeMetadata,
      });
    } catch (error) {
      const completedAt = now();
      const normalizedError = normalizeThrowableToTransportError(error);
      if (normalizedError.code === "TIMEOUT") {
        return buildTimeoutResult({
          request,
          startedAt,
          completedAt,
          timeoutMs,
          message: normalizedError.message,
          metadata: safeMetadata,
          error: normalizedError,
        });
      }
      return buildFailedResult({
        request,
        startedAt,
        completedAt,
        timeoutMs,
        error: normalizedError,
        metadata: safeMetadata,
      });
    }
  }
}

export function createHostedTableauMcpTransport(
  config: HostedTableauMcpTransportConfig = {},
  dependencies: HostedTableauMcpTransportDependencies = {},
): HostedTableauMcpTransport {
  return new HostedTableauMcpTransport(config, dependencies);
}

function normalizeClientResult(input: {
  request: TableauMcpTransportRequest;
  startedAt: Date;
  completedAt: Date;
  timeoutMs: number;
  clientResult: HostedMcpRequestClientResult;
  metadata: JsonObject;
}): TableauMcpTransportResult {
  switch (input.clientResult.status) {
    case "success":
    case "partial":
      return {
        requestId: input.request.requestId,
        transportKind: "hosted",
        status: input.clientResult.status,
        toolName: input.request.toolName,
        data: input.clientResult.data,
        warnings: input.clientResult.warnings,
        trace: buildTraceMetadata({
          request: input.request,
          startedAt: input.startedAt,
          completedAt: input.completedAt,
          durationMs: input.completedAt.getTime() - input.startedAt.getTime(),
          status: input.clientResult.status,
          metadata: input.metadata,
          clientTrace: input.clientResult.trace,
        }),
        timing: buildTiming({
          startedAt: input.startedAt,
          completedAt: input.completedAt,
          timeoutMs: input.timeoutMs,
          timedOut: false,
        }),
        metadata: buildResultMetadata({
          metadata: input.metadata,
          clientMetadata: input.clientResult.metadata,
          transportStatus: input.clientResult.status,
        }),
      };
    case "unsupported":
      return buildUnsupportedResult({
        request: input.request,
        startedAt: input.startedAt,
        completedAt: input.completedAt,
        timeoutMs: input.timeoutMs,
        message:
          "The Hosted Tableau MCP transport does not support this request.",
        metadata: input.metadata,
        warnings: input.clientResult.warnings,
        error: input.clientResult.error
          ? normalizeClientError(input.clientResult.error)
          : undefined,
      });
    case "timeout":
      return buildTimeoutResult({
        request: input.request,
        startedAt: input.startedAt,
        completedAt: input.completedAt,
        timeoutMs: input.timeoutMs,
        message: "The Hosted Tableau MCP transport request timed out.",
        metadata: input.metadata,
        warnings: input.clientResult.warnings,
        error: input.clientResult.error
          ? normalizeClientError(input.clientResult.error)
          : undefined,
      });
    case "not_configured":
      return buildNotConfiguredResult({
        request: input.request,
        startedAt: input.startedAt,
        timeoutMs: input.timeoutMs,
        reason: "The Hosted Tableau MCP transport is not configured.",
        metadata: input.metadata,
        warnings: input.clientResult.warnings,
        error: input.clientResult.error
          ? normalizeClientError(input.clientResult.error)
          : undefined,
      });
    case "failed":
    default:
      return buildFailedResult({
        request: input.request,
        startedAt: input.startedAt,
        completedAt: input.completedAt,
        timeoutMs: input.timeoutMs,
        error: input.clientResult.error
          ? normalizeClientError(input.clientResult.error)
          : {
              code: "UNKNOWN_ERROR",
              message: "The Hosted Tableau MCP transport failed unexpectedly.",
              retryable: false,
              userActionRequired: true,
            },
        metadata: input.metadata,
        warnings: input.clientResult.warnings,
      });
  }
}

function buildNotConfiguredResult(input: {
  request: TableauMcpTransportRequest;
  startedAt: Date;
  timeoutMs?: number;
  reason: string;
  metadata: JsonObject;
  warnings?: readonly TableauMcpTransportWarning[];
  error?: TableauMcpTransportError;
}): TableauMcpTransportResult {
  const completedAt = input.startedAt;
  return {
    requestId: input.request.requestId,
    transportKind: "hosted",
    status: "not_configured",
    toolName: input.request.toolName,
    warnings: input.warnings,
    error: input.error ?? {
      code: "TRANSPORT_NOT_CONFIGURED",
      message: input.reason,
      retryable: false,
      userActionRequired: true,
      source: "hosted_tableau_mcp_transport",
      metadata: {
        reason: input.reason,
      },
    },
    trace: buildTraceMetadata({
      request: input.request,
      startedAt: input.startedAt,
      completedAt,
      durationMs: 0,
      status: "not_configured",
      metadata: input.metadata,
    }),
    timing: buildTiming({
      startedAt: input.startedAt,
      completedAt,
      timeoutMs: input.timeoutMs,
      timedOut: false,
    }),
    metadata: buildResultMetadata({
      metadata: input.metadata,
      transportStatus: "not_configured",
      extra: {
        reason: input.reason,
      },
    }),
  };
}

function buildUnsupportedResult(input: {
  request: TableauMcpTransportRequest;
  startedAt: Date;
  completedAt?: Date;
  timeoutMs?: number;
  message: string;
  metadata: JsonObject;
  warnings?: readonly TableauMcpTransportWarning[];
  error?: TableauMcpTransportError;
}): TableauMcpTransportResult {
  const completedAt = input.completedAt ?? input.startedAt;
  return {
    requestId: input.request.requestId,
    transportKind: "hosted",
    status: "unsupported",
    toolName: input.request.toolName,
    warnings: input.warnings,
    error: input.error ?? {
      code: "UNSUPPORTED_TRANSPORT",
      message: input.message,
      retryable: false,
      userActionRequired: true,
      source: "hosted_tableau_mcp_transport",
    },
    trace: buildTraceMetadata({
      request: input.request,
      startedAt: input.startedAt,
      completedAt,
      durationMs: Math.max(
        0,
        completedAt.getTime() - input.startedAt.getTime(),
      ),
      status: "unsupported",
      metadata: input.metadata,
    }),
    timing: buildTiming({
      startedAt: input.startedAt,
      completedAt,
      timeoutMs: input.timeoutMs,
      timedOut: false,
    }),
    metadata: buildResultMetadata({
      metadata: input.metadata,
      transportStatus: "unsupported",
      extra: {
        reason: input.message,
      },
    }),
  };
}

function buildTimeoutResult(input: {
  request: TableauMcpTransportRequest;
  startedAt: Date;
  completedAt: Date;
  timeoutMs: number;
  message: string;
  metadata: JsonObject;
  warnings?: readonly TableauMcpTransportWarning[];
  error?: TableauMcpTransportError;
}): TableauMcpTransportResult {
  return {
    requestId: input.request.requestId,
    transportKind: "hosted",
    status: "timeout",
    toolName: input.request.toolName,
    warnings: input.warnings,
    error: input.error ?? {
      code: "TIMEOUT",
      message: input.message,
      retryable: true,
      userActionRequired: true,
      source: "hosted_tableau_mcp_transport",
    },
    trace: buildTraceMetadata({
      request: input.request,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      durationMs: Math.max(
        0,
        input.completedAt.getTime() - input.startedAt.getTime(),
      ),
      status: "timeout",
      metadata: input.metadata,
    }),
    timing: buildTiming({
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      timeoutMs: input.timeoutMs,
      timedOut: true,
    }),
    metadata: buildResultMetadata({
      metadata: input.metadata,
      transportStatus: "timeout",
      extra: {
        reason: input.message,
      },
    }),
  };
}

function buildFailedResult(input: {
  request: TableauMcpTransportRequest;
  startedAt: Date;
  completedAt: Date;
  timeoutMs: number;
  error: TableauMcpTransportError;
  metadata: JsonObject;
  warnings?: readonly TableauMcpTransportWarning[];
}): TableauMcpTransportResult {
  return {
    requestId: input.request.requestId,
    transportKind: "hosted",
    status: "failed",
    toolName: input.request.toolName,
    warnings: input.warnings,
    error: input.error,
    trace: buildTraceMetadata({
      request: input.request,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      durationMs: Math.max(
        0,
        input.completedAt.getTime() - input.startedAt.getTime(),
      ),
      status: "failed",
      metadata: input.metadata,
    }),
    timing: buildTiming({
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      timeoutMs: input.timeoutMs,
      timedOut: false,
    }),
    metadata: buildResultMetadata({
      metadata: input.metadata,
      transportStatus: "failed",
      extra: {
        errorCode: input.error.code,
      },
    }),
  };
}

function buildTraceMetadata(input: {
  request: TableauMcpTransportRequest;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  status: TableauMcpTransportStatus;
  metadata: JsonObject;
  clientTrace?: Partial<TableauMcpTransportTraceMetadata>;
}): TableauMcpTransportTraceMetadata {
  return {
    correlationId: input.request.correlationId,
    agentRunId: input.request.agentRunId,
    startedAt: input.startedAt.toISOString(),
    completedAt: input.completedAt.toISOString(),
    durationMs: input.durationMs,
    transportKind: "hosted",
    toolName: input.request.toolName,
    hostedSessionId: input.clientTrace?.hostedSessionId,
    remoteTraceId: input.clientTrace?.remoteTraceId,
    transportEventId: input.clientTrace?.transportEventId,
    metadata: {
      source: "hosted_tableau_mcp_transport",
      requestId: input.request.requestId,
      toolName: input.request.toolName,
      transportKind: "hosted",
      status: input.status,
      ...sanitizeJsonObject(input.metadata),
      ...(input.clientTrace?.metadata
        ? sanitizeJsonObject(input.clientTrace.metadata)
        : {}),
    },
  };
}

function buildTiming(input: {
  startedAt: Date;
  completedAt: Date;
  timeoutMs?: number;
  timedOut: boolean;
}): TableauMcpTransportTiming {
  return {
    startedAt: input.startedAt.toISOString(),
    completedAt: input.completedAt.toISOString(),
    durationMs: Math.max(
      0,
      input.completedAt.getTime() - input.startedAt.getTime(),
    ),
    timeoutMs: input.timeoutMs,
    timedOut: input.timedOut,
  };
}

function buildResultMetadata(input: {
  metadata: JsonObject;
  transportStatus: TableauMcpTransportStatus;
  clientMetadata?: JsonObject;
  extra?: JsonObject;
}): JsonObject {
  return {
    source: "hosted_tableau_mcp_transport",
    transportKind: "hosted",
    transportStatus: input.transportStatus,
    ...sanitizeJsonObject(input.metadata),
    ...(input.clientMetadata ? sanitizeJsonObject(input.clientMetadata) : {}),
    ...(input.extra ? sanitizeJsonObject(input.extra) : {}),
  };
}

function buildSafeMetadata(input: {
  request: TableauMcpTransportRequest;
  endpointConfigured: boolean;
  authConfigured: boolean;
  siteConfigured: boolean;
  requestClientConfigured: boolean;
  networkEnabled: boolean;
  protocol: HostedTableauMcpTransportProtocol;
}): JsonObject {
  return {
    source: "hosted_tableau_mcp_transport",
    requestId: input.request.requestId,
    toolName: input.request.toolName,
    transportKind: "hosted",
    requestAuthState: input.request.authContext?.state ?? "unknown",
    requestAuthMode: input.request.authContext?.mode ?? "unknown",
    requestAuthReasonCode: input.request.authContext?.reasonCode ?? "unknown",
    endpointConfigured: input.endpointConfigured,
    authConfigured: input.authConfigured,
    siteConfigured: input.siteConfigured,
    requestClientConfigured: input.requestClientConfigured,
    networkEnabled: input.networkEnabled,
    protocol: input.protocol,
  };
}

function normalizeTimeoutMs(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return value;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isAuthConfigured(
  config: HostedTableauMcpTransportConfig,
  requestAuthState?: HostedTableauMcpTransportAuthState,
): boolean {
  if (
    requestAuthState === "missing" ||
    requestAuthState === "expired" ||
    requestAuthState === "not_configured"
  ) {
    return false;
  }
  if (!config.authMode || config.authMode === "unknown") {
    return false;
  }
  if (config.authMode === "token_reference") {
    return isNonEmptyString(config.tokenReference);
  }
  return true;
}

function isSiteConfigured(config: HostedTableauMcpTransportConfig): boolean {
  return (
    isNonEmptyString(config.siteId) || isNonEmptyString(config.siteContentUrl)
  );
}

function normalizeThrowableToTransportError(
  error: unknown,
): TableauMcpTransportError {
  if (error instanceof Error) {
    const code = normalizeThrowableCode(error.name, error.message);
    return {
      code,
      message: safeErrorMessageForCode(code),
      retryable: code === "TIMEOUT" || code === "NETWORK_ERROR",
      userActionRequired: code !== "TIMEOUT" && code !== "NETWORK_ERROR",
      source: error.name,
    };
  }

  return {
    code: "UNKNOWN_ERROR",
    message: "The Hosted Tableau MCP transport failed unexpectedly.",
    retryable: false,
    userActionRequired: true,
  };
}

function normalizeClientError(
  error: TableauMcpTransportError,
): TableauMcpTransportError {
  return {
    code: error.code,
    message: safeErrorMessageForCode(error.code),
    ...(error.retryable !== undefined ? { retryable: error.retryable } : {}),
    ...(error.userActionRequired !== undefined
      ? { userActionRequired: error.userActionRequired }
      : {}),
    ...(error.source ? { source: error.source } : {}),
    ...(error.metadata ? { metadata: sanitizeJsonObject(error.metadata) } : {}),
  };
}

function normalizeThrowableCode(
  name: string | undefined,
  message: string | undefined,
): TableauMcpTransportError["code"] {
  const haystack = `${name ?? ""} ${message ?? ""}`.toLowerCase();
  if (haystack.includes("timeout") || haystack.includes("timed out")) {
    return "TIMEOUT";
  }
  if (haystack.includes("auth") && haystack.includes("expired")) {
    return "AUTH_EXPIRED";
  }
  if (haystack.includes("auth")) {
    return "AUTH_REQUIRED";
  }
  if (haystack.includes("permission")) {
    return "PERMISSION_DENIED";
  }
  if (haystack.includes("site settings")) {
    return "SITE_SETTINGS_DISABLED";
  }
  if (haystack.includes("protocol")) {
    return "MCP_PROTOCOL_ERROR";
  }
  if (haystack.includes("unsupported")) {
    return "UNSUPPORTED_TRANSPORT";
  }
  if (haystack.includes("network")) {
    return "NETWORK_ERROR";
  }
  if (haystack.includes("tool not found")) {
    return "TOOL_NOT_FOUND";
  }
  if (haystack.includes("invalid tool input")) {
    return "INVALID_TOOL_INPUT";
  }
  if (haystack.includes("remote server")) {
    return "REMOTE_SERVER_ERROR";
  }
  return "UNKNOWN_ERROR";
}

function safeErrorMessageForCode(
  code: TableauMcpTransportError["code"],
): string {
  switch (code) {
    case "TRANSPORT_NOT_CONFIGURED":
      return "The Hosted Tableau MCP transport is not configured.";
    case "UNSUPPORTED_TRANSPORT":
      return "The Hosted Tableau MCP transport does not support this request.";
    case "AUTH_REQUIRED":
      return "Tableau authentication is required for Hosted MCP execution.";
    case "AUTH_EXPIRED":
      return "Tableau authentication has expired for Hosted MCP execution.";
    case "PERMISSION_DENIED":
      return "Tableau permission is denied for this Hosted MCP request.";
    case "SITE_SETTINGS_DISABLED":
      return "Hosted Tableau MCP is disabled for this site.";
    case "NETWORK_ERROR":
      return "The Hosted Tableau MCP transport could not reach the endpoint.";
    case "TIMEOUT":
      return "The Hosted Tableau MCP transport request timed out.";
    case "MCP_PROTOCOL_ERROR":
      return "The Hosted Tableau MCP protocol response was invalid.";
    case "TOOL_NOT_FOUND":
      return "The requested Hosted Tableau MCP tool was not found.";
    case "INVALID_TOOL_INPUT":
      return "The Hosted Tableau MCP tool input was invalid.";
    case "REMOTE_SERVER_ERROR":
      return "The Hosted Tableau MCP server returned an error.";
    case "STDIO_PROCESS_ERROR":
      return "The stdio transport process failed.";
    case "UNKNOWN_ERROR":
    default:
      return "The Hosted Tableau MCP transport failed unexpectedly.";
  }
}

function sanitizeJsonObject(value: JsonObject): JsonObject {
  const result: JsonObject = {};
  for (const [key, item] of Object.entries(value)) {
    const normalized = sanitizeJsonValue(key, item);
    if (normalized !== undefined) {
      result[key] = normalized as JsonObject[string];
    }
  }
  return result;
}

function sanitizeJsonValue(key: string, value: unknown): unknown {
  if (isSensitiveKey(key)) {
    return "[Redacted]";
  }
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizeAnonymousValue(entry))
      .filter((entry) => entry !== undefined);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value && typeof value === "object") {
    const nested: JsonObject = {};
    for (const [nestedKey, nestedValue] of Object.entries(
      value as JsonObject,
    )) {
      const normalized = sanitizeJsonValue(nestedKey, nestedValue);
      if (normalized !== undefined) {
        nested[nestedKey] = normalized as JsonObject[string];
      }
    }
    return nested;
  }
  return undefined;
}

function sanitizeAnonymousValue(value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const nested: JsonObject = {};
    for (const [nestedKey, nestedValue] of Object.entries(
      value as JsonObject,
    )) {
      const normalized = sanitizeJsonValue(nestedKey, nestedValue);
      if (normalized !== undefined) {
        nested[nestedKey] = normalized as JsonObject[string];
      }
    }
    return nested;
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizeAnonymousValue(entry))
      .filter((entry) => entry !== undefined);
  }
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  return undefined;
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();
  if (normalized.startsWith("tokenreference")) {
    return false;
  }
  return (
    normalized === "raw" ||
    normalized === "rawresult" ||
    normalized === "rawmcpresult" ||
    normalized === "mcpresponse" ||
    normalized === "serverresponse" ||
    normalized === "transportrawresult" ||
    normalized === "stdout" ||
    normalized === "stderr" ||
    normalized === "stack" ||
    normalized === "stacktrace" ||
    normalized === "authorization" ||
    normalized === "authorizationheader" ||
    normalized === "token" ||
    normalized === "accesstoken" ||
    normalized === "refreshtoken" ||
    normalized === "idtoken" ||
    normalized.endsWith("token") ||
    normalized.includes("secret") ||
    normalized.includes("password") ||
    normalized.includes("cookie") ||
    normalized === "jwt" ||
    normalized === "setcookie"
  );
}
