import type { JsonObject } from "./types";
import type {
  TableauMetadataErrorCode,
  TableauMetadataErrorSummary,
} from "./tableauMetadataSchemas";

export type HostedMcpMetadataErrorOperation =
  | "describeDatasource"
  | "listFields"
  | "unknown";

export type HostedMcpMetadataErrorInput = {
  toolName?: string;
  operation?: HostedMcpMetadataErrorOperation;
  transportKind?: string;
  transportStatus?: string;
  code?: string;
  message?: string;
  reason?: string;
  retryable?: boolean;
  userActionRequired?: boolean;
  target?: string;
  requestId?: string;
  correlationId?: string;
  agentRunId?: string;
  metadata?: JsonObject;
};

const HOSTED_ERROR_CODE_SET = new Set<TableauMetadataErrorCode>([
  "AUTH_REQUIRED",
  "AUTH_EXPIRED",
  "PERMISSION_DENIED",
  "SITE_SETTINGS_DISABLED",
  "TRANSPORT_NOT_CONFIGURED",
  "NETWORK_ERROR",
  "TIMEOUT",
  "MCP_PROTOCOL_ERROR",
  "TOOL_NOT_FOUND",
  "INVALID_INPUT",
  "REMOTE_SERVER_ERROR",
  "TRANSPORT_FAILED",
  "UNKNOWN_ERROR",
]);

export function normalizeHostedMcpMetadataError(
  input: HostedMcpMetadataErrorInput,
): TableauMetadataErrorSummary {
  const code = normalizeHostedMcpMetadataErrorCode(input);
  const retryable =
    input.retryable ?? defaultRetryableForHostedMetadataError(code);
  const userActionRequired =
    input.userActionRequired ??
    defaultUserActionRequiredForHostedMetadataError(code);

  return {
    code,
    message: safeHostedMetadataErrorMessage(code),
    retryable,
    userActionRequired,
    ...(input.target ? { target: input.target } : {}),
    metadata: buildHostedMetadataErrorMetadata({
      input,
      code,
      retryable,
      userActionRequired,
    }),
  };
}

export function normalizeHostedMcpMetadataErrorCode(
  input: Pick<
    HostedMcpMetadataErrorInput,
    "code" | "message" | "reason" | "transportStatus" | "transportKind"
  >,
): TableauMetadataErrorCode {
  const code = normalizeKnownHostedErrorCode(input.code);
  if (code) {
    return code;
  }

  const haystack = [
    input.code,
    input.message,
    input.reason,
    input.transportStatus,
    input.transportKind,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  if (haystack.includes("auth") && haystack.includes("expired")) {
    return "AUTH_EXPIRED";
  }

  if (haystack.includes("auth")) {
    return "AUTH_REQUIRED";
  }

  if (haystack.includes("permission") || haystack.includes("forbidden")) {
    return "PERMISSION_DENIED";
  }

  if (
    haystack.includes("site settings") ||
    haystack.includes("hosted mcp disabled") ||
    haystack.includes("site disabled")
  ) {
    return "SITE_SETTINGS_DISABLED";
  }

  if (
    haystack.includes("not configured") ||
    haystack.includes("missing endpoint") ||
    haystack.includes("endpoint missing")
  ) {
    return "TRANSPORT_NOT_CONFIGURED";
  }

  if (haystack.includes("timeout") || haystack.includes("timed out")) {
    return "TIMEOUT";
  }

  if (
    haystack.includes("protocol") ||
    haystack.includes("parse error") ||
    haystack.includes("malformed") ||
    haystack.includes("invalid json")
  ) {
    return "MCP_PROTOCOL_ERROR";
  }

  if (
    haystack.includes("tool not found") ||
    haystack.includes("method not found") ||
    haystack.includes("unknown tool")
  ) {
    return "TOOL_NOT_FOUND";
  }

  if (
    haystack.includes("invalid input") ||
    haystack.includes("bad request") ||
    haystack.includes("validation")
  ) {
    return "INVALID_INPUT";
  }

  if (
    haystack.includes("network") ||
    haystack.includes("dns") ||
    haystack.includes("tls") ||
    haystack.includes("connection refused") ||
    haystack.includes("econn") ||
    haystack.includes("fetch failed")
  ) {
    return "NETWORK_ERROR";
  }

  if (haystack.includes("remote server") || haystack.includes("upstream")) {
    return "REMOTE_SERVER_ERROR";
  }

  if (input.transportStatus === "not_configured") {
    return "TRANSPORT_NOT_CONFIGURED";
  }

  if (input.transportStatus === "timeout") {
    return "TIMEOUT";
  }

  if (input.transportStatus === "unsupported") {
    return "TRANSPORT_FAILED";
  }

  if (input.transportStatus === "failed") {
    return "UNKNOWN_ERROR";
  }

  return "UNKNOWN_ERROR";
}

export function safeHostedMetadataErrorMessage(
  code: TableauMetadataErrorCode,
): string {
  switch (code) {
    case "AUTH_REQUIRED":
      return "Tableau authentication is required before this metadata request can run.";
    case "AUTH_EXPIRED":
      return "Tableau authentication has expired. Please reconnect before retrying.";
    case "PERMISSION_DENIED":
      return "You do not have permission to access this Tableau metadata.";
    case "SITE_SETTINGS_DISABLED":
      return "Hosted Tableau MCP is not enabled for this site.";
    case "TRANSPORT_NOT_CONFIGURED":
      return "Hosted Tableau MCP is not configured.";
    case "NETWORK_ERROR":
      return "Could not reach Hosted Tableau MCP.";
    case "TIMEOUT":
      return "Hosted Tableau MCP did not respond before the timeout.";
    case "MCP_PROTOCOL_ERROR":
      return "Hosted Tableau MCP returned an unexpected protocol response.";
    case "TOOL_NOT_FOUND":
      return "The expected Tableau metadata tool is not available from Hosted MCP.";
    case "INVALID_INPUT":
      return "The metadata request was not accepted because the input was invalid.";
    case "REMOTE_SERVER_ERROR":
      return "Hosted Tableau MCP returned a server error.";
    case "TRANSPORT_FAILED":
      return "The Hosted Tableau MCP transport failed.";
    case "UNKNOWN_ERROR":
    default:
      return "An unknown Hosted Tableau MCP error occurred.";
  }
}

function normalizeKnownHostedErrorCode(
  value: string | undefined,
): TableauMetadataErrorCode | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.toUpperCase();
  if (HOSTED_ERROR_CODE_SET.has(normalized as TableauMetadataErrorCode)) {
    return normalized as TableauMetadataErrorCode;
  }

  if (normalized === "UNSUPPORTED_TRANSPORT") {
    return "TRANSPORT_FAILED";
  }

  return undefined;
}

function defaultRetryableForHostedMetadataError(
  code: TableauMetadataErrorCode,
): boolean {
  switch (code) {
    case "AUTH_REQUIRED":
    case "AUTH_EXPIRED":
    case "TRANSPORT_NOT_CONFIGURED":
    case "NETWORK_ERROR":
    case "TIMEOUT":
    case "REMOTE_SERVER_ERROR":
      return true;
    case "INVALID_INPUT":
    case "MCP_PROTOCOL_ERROR":
    case "PERMISSION_DENIED":
    case "SITE_SETTINGS_DISABLED":
    case "TOOL_NOT_FOUND":
    case "TRANSPORT_FAILED":
    case "UNKNOWN_ERROR":
    default:
      return false;
  }
}

function defaultUserActionRequiredForHostedMetadataError(
  code: TableauMetadataErrorCode,
): boolean {
  switch (code) {
    case "AUTH_REQUIRED":
    case "AUTH_EXPIRED":
    case "PERMISSION_DENIED":
    case "SITE_SETTINGS_DISABLED":
    case "TRANSPORT_NOT_CONFIGURED":
    case "INVALID_INPUT":
    case "TRANSPORT_FAILED":
    case "UNKNOWN_ERROR":
      return true;
    case "NETWORK_ERROR":
    case "TIMEOUT":
    case "MCP_PROTOCOL_ERROR":
    case "TOOL_NOT_FOUND":
    case "REMOTE_SERVER_ERROR":
    default:
      return false;
  }
}

function buildHostedMetadataErrorMetadata(input: {
  input: HostedMcpMetadataErrorInput;
  code: TableauMetadataErrorCode;
  retryable: boolean;
  userActionRequired: boolean;
}): JsonObject {
  const metadata: JsonObject = {
    source: "hosted_mcp_metadata_error_normalizer",
    normalizedCode: input.code,
    retryable: input.retryable,
    userActionRequired: input.userActionRequired,
  };

  if (input.input.toolName) {
    metadata.toolName = input.input.toolName;
  }

  if (input.input.operation) {
    metadata.operation = input.input.operation;
  }

  if (input.input.transportKind) {
    metadata.transportKind = input.input.transportKind;
  }

  if (input.input.transportStatus) {
    metadata.transportStatus = input.input.transportStatus;
  }

  if (input.input.requestId) {
    metadata.requestId = input.input.requestId;
  }

  if (input.input.correlationId) {
    metadata.correlationId = input.input.correlationId;
  }

  if (input.input.agentRunId) {
    metadata.agentRunId = input.input.agentRunId;
  }

  if (input.input.target) {
    metadata.target = input.input.target;
  }

  return metadata;
}
