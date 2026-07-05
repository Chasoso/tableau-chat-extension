import type { JsonObject, JsonValue } from "./types";
import type {
  TableauDescribeDatasourceOutput,
  TableauListFieldsOutput,
  TableauMetadataErrorSummary,
  TableauMetadataOmissionSummary,
  TableauMetadataOmissionReason,
  TableauMetadataResolutionSummary,
  TableauMetadataTruncationSummary,
  TableauMetadataWarningSummary,
} from "./tableauMetadataSchemas";
import type {
  TableauMetadataPreconditionResult,
  TableauMetadataPreconditionStatus,
} from "./tableauMetadataPreconditions";
import type {
  TableauMcpTransportKind,
  TableauMcpTransportRequest,
  TableauMcpTransportResult,
  TableauMcpTransportStatus,
  TableauMcpTransportError,
} from "./tableauMetadataToolRuntime";
import { normalizeHostedMcpMetadataError } from "./hostedMcpMetadataErrorNormalizer";

export type TableauMetadataNormalizedStatus =
  | "success"
  | "partial"
  | "failed"
  | "blocked";

export type TableauMetadataTraceEventName =
  | "tableau_metadata_tool.started"
  | "tableau_metadata_tool.completed"
  | "tableau_metadata_tool.failed";

export type TableauMetadataTraceEvent = {
  eventName: TableauMetadataTraceEventName;
  requestId?: string;
  correlationId?: string;
  agentRunId?: string;
  toolName: string;
  status?: TableauMetadataNormalizedStatus;
  transportStatus?: TableauMcpTransportStatus;
  transportKind?: TableauMcpTransportKind;
  requestedTransportKind?: TableauMcpTransportKind;
  selectedTransportKind?: TableauMcpTransportKind;
  fallbackUsed?: boolean;
  fallbackFrom?: TableauMcpTransportKind;
  fallbackTo?: TableauMcpTransportKind;
  hostedFeatureEnabled?: boolean;
  noNetworkRequested?: boolean;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  warningCount?: number;
  errorCode?: string;
  truncated?: boolean;
  limitApplied?: number;
  returnedCount?: number;
  totalCountKnown?: boolean;
  totalCount?: number;
  omittedCountKnown?: boolean;
  omittedCount?: number;
  omissionReasons?: readonly string[];
  truncationReason?: string;
  permissionLimited?: boolean;
  permissionStatus?: "verified" | "limited" | "unknown";
  permissionNotes?: readonly string[];
  safeMessage?: string;
  fakeNoNetwork?: boolean;
  metadata?: JsonObject;
};

export type TableauMetadataTraceSummary = {
  eventNames: readonly TableauMetadataTraceEventName[];
  requestId?: string;
  correlationId?: string;
  agentRunId?: string;
  toolName: string;
  status: TableauMetadataNormalizedStatus;
  transportStatus?: TableauMcpTransportStatus;
  transportKind?: TableauMcpTransportKind;
  requestedTransportKind?: TableauMcpTransportKind;
  selectedTransportKind?: TableauMcpTransportKind;
  fallbackUsed?: boolean;
  fallbackFrom?: TableauMcpTransportKind;
  fallbackTo?: TableauMcpTransportKind;
  hostedFeatureEnabled?: boolean;
  noNetworkRequested?: boolean;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  warningCount?: number;
  errorCode?: string;
  truncated?: boolean;
  limitApplied?: number;
  returnedCount?: number;
  totalCountKnown?: boolean;
  totalCount?: number;
  omittedCountKnown?: boolean;
  omittedCount?: number;
  omissionReasons?: readonly string[];
  truncationReason?: string;
  permissionLimited?: boolean;
  permissionStatus?: "verified" | "limited" | "unknown";
  permissionNotes?: readonly string[];
  safeMessage?: string;
  fakeNoNetwork?: boolean;
  metadata?: JsonObject;
};

export type TableauMetadataPermissionStatus =
  | "verified"
  | "limited"
  | "unknown";

export type TableauMetadataNormalizedResult = {
  toolName: string;
  status: TableauMetadataNormalizedStatus;
  summary: JsonObject;
  warnings?: readonly TableauMetadataWarningSummary[];
  error?: TableauMetadataErrorSummary;
  truncation?: TableauMetadataTruncationSummary;
  omissions?: readonly TableauMetadataOmissionSummary[];
  resolution?: TableauMetadataResolutionSummary;
  trace?: TableauMetadataTraceSummary;
  traceSafeSummary?: JsonObject;
  truncated?: boolean;
  limitApplied?: number;
  returnedCount?: number;
  totalCountKnown?: boolean;
  totalCount?: number;
  omittedCountKnown?: boolean;
  omittedCount?: number;
  omissionReasons?: readonly string[];
  truncationReason?: string;
  permissionLimited?: boolean;
  permissionStatus?: TableauMetadataPermissionStatus;
  permissionNotes?: readonly string[];
  safeMessage?: string;
  metadata?: JsonObject;
};

export type TableauMetadataOutputNormalizationInput = {
  toolName: string;
  request: TableauMcpTransportRequest;
  precondition: TableauMetadataPreconditionResult;
  fallbackOutput: TableauDescribeDatasourceOutput | TableauListFieldsOutput;
  transportResult?: TableauMcpTransportResult;
  startedAt?: string;
  completedAt?: string;
};

const MAX_JSON_DEPTH = 6;
const MAX_JSON_ENTRIES = 48;
const MAX_STRING_LENGTH = 2_000;
const FORBIDDEN_METADATA_KEYS = new Set([
  "raw",
  "rawResult",
  "rawMcpResult",
  "mcpResponse",
  "serverResponse",
  "transportRawResult",
  "stdout",
  "stderr",
  "stack",
  "stackTrace",
  "accessToken",
  "refreshToken",
  "authorizationHeader",
  "authorization",
  "secret",
  "secrets",
  "token",
  "tokens",
]);

export function normalizeTableauMetadataExecutionResult(
  input: TableauMetadataOutputNormalizationInput,
): TableauMetadataNormalizedResult {
  const candidateOutput =
    isJsonObject(input.transportResult?.data) &&
    isTableauMetadataOutputCandidate(input.transportResult.data, input.toolName)
      ? (input.transportResult.data as
          | TableauDescribeDatasourceOutput
          | TableauListFieldsOutput)
      : input.fallbackOutput;
  const normalizedStatus = normalizeStatus(
    input.precondition,
    candidateOutput.status,
    input.transportResult?.status,
  );
  const warnings = normalizeWarnings([
    ...(candidateOutput.warnings ?? []),
    ...(input.transportResult?.warnings ?? []),
    ...(input.precondition.warnings ?? []),
    ...buildDiscoveryWarnings(
      candidateOutput,
      input.toolName,
      input.precondition,
    ),
  ]);
  const permissionSummary = buildPermissionSummary(input.precondition);
  const transportFailure =
    input.transportResult &&
    input.transportResult.status !== "success" &&
    input.transportResult.status !== "partial";
  const error = normalizeError(
    transportFailure
      ? (input.transportResult?.error ?? candidateOutput.error)
      : (candidateOutput.error ?? input.transportResult?.error),
    input.precondition,
    normalizedStatus,
    input.transportResult?.status,
    input,
  );
  const summary = buildSummary(candidateOutput, input.toolName);
  const resolution =
    normalizeResolution(candidateOutput.resolution) ??
    normalizeResolution(input.fallbackOutput.resolution);
  const truncation = normalizeTruncation(
    candidateOutput.truncation ?? input.fallbackOutput.truncation,
  );
  const omissions = normalizeOmissions(
    candidateOutput.omissions ?? input.fallbackOutput.omissions,
  );
  const envelopeSummary = buildDiscoveryEnvelopeSummary(
    candidateOutput,
    input.toolName,
    truncation,
    omissions,
    permissionSummary,
  );
  const trace = buildTraceSummary({
    input,
    status: normalizedStatus,
    warnings,
    error,
    truncation,
    omissions,
    envelopeSummary,
    permissionSummary,
  });
  const safeMessage =
    envelopeSummary.safeMessage ??
    permissionSummary.permissionNotes?.[0] ??
    (normalizedStatus === "blocked"
      ? (input.precondition.userFacingMessage ?? input.precondition.message)
      : undefined);
  const metadata = sanitizeJsonObject({
    source: "tableau_metadata_output_normalization",
    requestId: input.request.requestId,
    correlationId: input.request.correlationId,
    agentRunId: input.request.agentRunId,
    toolName: input.toolName,
    transportKind:
      input.transportResult?.transportKind ??
      readTransportKind(input.request.metadata?.transportKind) ??
      "unknown",
    transportStatus: trace?.transportStatus ?? input.transportResult?.status,
    preconditionStatus: input.precondition.status,
    warningCount: warnings.length,
    errorCode: error?.code,
    fakeNoNetwork:
      input.transportResult?.transportKind === "fake" ||
      input.request.metadata?.noNetwork === true,
    transportEventId: input.transportResult?.trace?.transportEventId,
    remoteTraceId: input.transportResult?.trace?.remoteTraceId,
    hostedSessionId: input.transportResult?.trace?.hostedSessionId,
    transportTraceMetadata: input.transportResult?.trace?.metadata,
    requestedTransportKind: trace?.requestedTransportKind,
    selectedTransportKind: trace?.selectedTransportKind,
    fallbackUsed: trace?.fallbackUsed,
    ...(trace?.fallbackFrom ? { fallbackFrom: trace.fallbackFrom } : {}),
    ...(trace?.fallbackTo ? { fallbackTo: trace.fallbackTo } : {}),
    ...(trace?.hostedFeatureEnabled !== undefined
      ? { hostedFeatureEnabled: trace.hostedFeatureEnabled }
      : {}),
    ...(trace?.noNetworkRequested !== undefined
      ? { noNetworkRequested: trace.noNetworkRequested }
      : {}),
    ...(isJsonObject(candidateOutput.metadata)
      ? sanitizeJsonObject(candidateOutput.metadata)
      : {}),
  });

  const normalizedResult: TableauMetadataNormalizedResult = {
    toolName: input.toolName,
    status: normalizedStatus,
    summary,
    ...(warnings.length > 0 ? { warnings } : {}),
    ...(error ? { error } : {}),
    ...(truncation ? { truncation } : {}),
    ...(omissions?.length ? { omissions } : {}),
    ...(resolution ? { resolution } : {}),
    ...(trace ? { trace } : {}),
    traceSafeSummary: buildTraceSafeSummary({
      input,
      status: normalizedStatus,
      warnings,
      error,
      truncation,
      omissions,
      envelopeSummary,
      permissionSummary,
      safeMessage,
    }),
    ...(envelopeSummary.truncated !== undefined
      ? { truncated: envelopeSummary.truncated }
      : {}),
    ...(envelopeSummary.limitApplied !== undefined
      ? { limitApplied: envelopeSummary.limitApplied }
      : {}),
    ...(envelopeSummary.returnedCount !== undefined
      ? { returnedCount: envelopeSummary.returnedCount }
      : {}),
    ...(envelopeSummary.totalCountKnown !== undefined
      ? { totalCountKnown: envelopeSummary.totalCountKnown }
      : {}),
    ...(envelopeSummary.totalCount !== undefined
      ? { totalCount: envelopeSummary.totalCount }
      : {}),
    ...(envelopeSummary.omittedCountKnown !== undefined
      ? { omittedCountKnown: envelopeSummary.omittedCountKnown }
      : {}),
    ...(envelopeSummary.omittedCount !== undefined
      ? { omittedCount: envelopeSummary.omittedCount }
      : {}),
    ...(envelopeSummary.omissionReasons?.length
      ? { omissionReasons: [...envelopeSummary.omissionReasons] }
      : {}),
    ...(envelopeSummary.truncationReason
      ? { truncationReason: envelopeSummary.truncationReason }
      : {}),
    ...(permissionSummary.permissionLimited !== undefined
      ? { permissionLimited: permissionSummary.permissionLimited }
      : {}),
    ...(permissionSummary.permissionStatus
      ? { permissionStatus: permissionSummary.permissionStatus }
      : {}),
    ...(permissionSummary.permissionNotes?.length
      ? { permissionNotes: [...permissionSummary.permissionNotes] }
      : {}),
    ...(safeMessage ? { safeMessage } : {}),
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  };

  return normalizedResult;
}

export function normalizeTableauMetadataOutput(
  input: TableauMetadataOutputNormalizationInput,
): TableauMetadataNormalizedResult {
  return normalizeTableauMetadataExecutionResult(input);
}

export function createTableauMetadataToolStartedEvent(
  input: TableauMetadataTraceEvent,
): TableauMetadataTraceEvent {
  return buildTraceEvent("tableau_metadata_tool.started", input);
}

export function createTableauMetadataToolCompletedEvent(
  input: TableauMetadataTraceEvent,
): TableauMetadataTraceEvent {
  return buildTraceEvent("tableau_metadata_tool.completed", input);
}

export function createTableauMetadataToolFailedEvent(
  input: TableauMetadataTraceEvent,
): TableauMetadataTraceEvent {
  return buildTraceEvent("tableau_metadata_tool.failed", input);
}

function buildTraceEvent(
  eventName: TableauMetadataTraceEventName,
  input: TableauMetadataTraceEvent,
): TableauMetadataTraceEvent {
  return {
    eventName,
    requestId: input.requestId,
    correlationId: input.correlationId,
    agentRunId: input.agentRunId,
    toolName: input.toolName,
    status: input.status,
    transportKind: input.transportKind,
    transportStatus: input.transportStatus,
    requestedTransportKind: input.requestedTransportKind,
    selectedTransportKind: input.selectedTransportKind,
    fallbackUsed: input.fallbackUsed,
    fallbackFrom: input.fallbackFrom,
    fallbackTo: input.fallbackTo,
    hostedFeatureEnabled: input.hostedFeatureEnabled,
    noNetworkRequested: input.noNetworkRequested,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    durationMs: input.durationMs,
    warningCount: input.warningCount,
    errorCode: input.errorCode,
    truncated: input.truncated,
    limitApplied: input.limitApplied,
    returnedCount: input.returnedCount,
    totalCountKnown: input.totalCountKnown,
    totalCount: input.totalCount,
    omittedCountKnown: input.omittedCountKnown,
    omittedCount: input.omittedCount,
    omissionReasons: input.omissionReasons,
    truncationReason: input.truncationReason,
    permissionLimited: input.permissionLimited,
    permissionStatus: input.permissionStatus,
    permissionNotes: input.permissionNotes,
    safeMessage: input.safeMessage,
    fakeNoNetwork: input.fakeNoNetwork,
    metadata: input.metadata ? sanitizeJsonObject(input.metadata) : undefined,
  };
}

function buildTraceSummary(input: {
  input: TableauMetadataOutputNormalizationInput;
  status: TableauMetadataNormalizedStatus;
  warnings: readonly TableauMetadataWarningSummary[];
  error?: TableauMetadataErrorSummary;
  truncation?: TableauMetadataTruncationSummary;
  omissions?: readonly TableauMetadataOmissionSummary[];
  envelopeSummary: DiscoveryEnvelopeSummary;
  permissionSummary: DiscoveryPermissionSummary;
}): TableauMetadataTraceSummary {
  const startedAt =
    input.input.startedAt ??
    input.input.transportResult?.trace?.startedAt ??
    input.input.transportResult?.timing?.startedAt;
  const completedAt =
    input.input.completedAt ??
    input.input.transportResult?.trace?.completedAt ??
    input.input.transportResult?.timing?.completedAt ??
    startedAt;
  const durationMs =
    input.input.transportResult?.trace?.durationMs ??
    input.input.transportResult?.timing?.durationMs ??
    (startedAt && completedAt
      ? Math.max(0, Date.parse(completedAt) - Date.parse(startedAt))
      : undefined);
  const traceTransportContext = buildTraceTransportContext(input.input);
  const eventNames: TableauMetadataTraceEventName[] = [
    "tableau_metadata_tool.started",
    input.status === "success" || input.status === "partial"
      ? "tableau_metadata_tool.completed"
      : "tableau_metadata_tool.failed",
  ];
  const omittedCount = input.omissions?.reduce(
    (sum, omission) => sum + (omission.count ?? 0),
    0,
  );

  return {
    eventNames,
    requestId: input.input.request.requestId,
    correlationId: input.input.request.correlationId,
    agentRunId: input.input.request.agentRunId,
    toolName: input.input.toolName,
    status: input.status,
    transportStatus: input.input.transportResult?.status,
    transportKind:
      input.input.transportResult?.transportKind ??
      readTransportKind(input.input.request.metadata?.transportKind) ??
      "unknown",
    requestedTransportKind: traceTransportContext.requestedTransportKind,
    selectedTransportKind: traceTransportContext.selectedTransportKind,
    fallbackUsed: traceTransportContext.fallbackUsed,
    fallbackFrom: traceTransportContext.fallbackFrom,
    fallbackTo: traceTransportContext.fallbackTo,
    hostedFeatureEnabled: traceTransportContext.hostedFeatureEnabled,
    noNetworkRequested: traceTransportContext.noNetworkRequested,
    startedAt,
    completedAt,
    durationMs,
    warningCount: input.warnings.length,
    errorCode: input.error?.code,
    truncated: input.truncation?.truncated,
    limitApplied: input.envelopeSummary.limitApplied,
    returnedCount: input.envelopeSummary.returnedCount,
    totalCountKnown: input.envelopeSummary.totalCountKnown,
    totalCount: input.envelopeSummary.totalCount,
    omittedCountKnown: input.envelopeSummary.omittedCountKnown,
    omittedCount:
      input.envelopeSummary.omittedCount ??
      (typeof omittedCount === "number" && Number.isFinite(omittedCount)
        ? omittedCount
        : undefined),
    omissionReasons: input.envelopeSummary.omissionReasons,
    truncationReason: input.envelopeSummary.truncationReason,
    permissionLimited: input.permissionSummary.permissionLimited,
    permissionStatus: input.permissionSummary.permissionStatus,
    permissionNotes: input.permissionSummary.permissionNotes,
    safeMessage:
      input.envelopeSummary.safeMessage ??
      input.permissionSummary.permissionNotes?.[0],
    fakeNoNetwork:
      input.input.transportResult?.transportKind === "fake" ||
      input.input.request.metadata?.noNetwork === true,
    metadata: sanitizeJsonObject({
      source: "tableau_metadata_trace_summary",
      transportEventId: input.input.transportResult?.trace?.transportEventId,
      remoteTraceId: input.input.transportResult?.trace?.remoteTraceId,
      hostedSessionId: input.input.transportResult?.trace?.hostedSessionId,
      transportStatus: input.input.transportResult?.status,
      preconditionStatus: input.input.precondition.status,
      warningCount: input.warnings.length,
      ...(input.error?.code ? { errorCode: input.error.code } : {}),
      ...(input.envelopeSummary.truncated !== undefined
        ? { truncated: input.envelopeSummary.truncated }
        : {}),
      ...(input.envelopeSummary.limitApplied !== undefined
        ? { limitApplied: input.envelopeSummary.limitApplied }
        : {}),
      ...(input.envelopeSummary.returnedCount !== undefined
        ? { returnedCount: input.envelopeSummary.returnedCount }
        : {}),
      ...(input.envelopeSummary.totalCountKnown !== undefined
        ? { totalCountKnown: input.envelopeSummary.totalCountKnown }
        : {}),
      ...(input.envelopeSummary.totalCount !== undefined
        ? { totalCount: input.envelopeSummary.totalCount }
        : {}),
      ...(input.envelopeSummary.omittedCountKnown !== undefined
        ? { omittedCountKnown: input.envelopeSummary.omittedCountKnown }
        : {}),
      ...(input.envelopeSummary.omittedCount !== undefined
        ? { omittedCount: input.envelopeSummary.omittedCount }
        : {}),
      ...(input.envelopeSummary.omissionReasons?.length
        ? { omissionReasons: [...input.envelopeSummary.omissionReasons] }
        : {}),
      ...(input.envelopeSummary.truncationReason
        ? { truncationReason: input.envelopeSummary.truncationReason }
        : {}),
      ...(input.permissionSummary.permissionLimited !== undefined
        ? { permissionLimited: input.permissionSummary.permissionLimited }
        : {}),
      ...(input.permissionSummary.permissionStatus
        ? { permissionStatus: input.permissionSummary.permissionStatus }
        : {}),
      ...(input.permissionSummary.permissionNotes?.length
        ? { permissionNotes: [...input.permissionSummary.permissionNotes] }
        : {}),
      ...(traceTransportContext.requestedTransportKind
        ? {
            requestedTransportKind:
              traceTransportContext.requestedTransportKind,
          }
        : {}),
      ...(traceTransportContext.selectedTransportKind
        ? {
            selectedTransportKind: traceTransportContext.selectedTransportKind,
          }
        : {}),
      ...(traceTransportContext.fallbackUsed !== undefined
        ? { fallbackUsed: traceTransportContext.fallbackUsed }
        : {}),
      ...(traceTransportContext.fallbackFrom
        ? { fallbackFrom: traceTransportContext.fallbackFrom }
        : {}),
      ...(traceTransportContext.fallbackTo
        ? { fallbackTo: traceTransportContext.fallbackTo }
        : {}),
      ...(traceTransportContext.hostedFeatureEnabled !== undefined
        ? { hostedFeatureEnabled: traceTransportContext.hostedFeatureEnabled }
        : {}),
      ...(traceTransportContext.noNetworkRequested !== undefined
        ? { noNetworkRequested: traceTransportContext.noNetworkRequested }
        : {}),
    }),
  };
}

function buildTraceSafeSummary(input: {
  input: TableauMetadataOutputNormalizationInput;
  status: TableauMetadataNormalizedStatus;
  warnings: readonly TableauMetadataWarningSummary[];
  error?: TableauMetadataErrorSummary;
  truncation?: TableauMetadataTruncationSummary;
  omissions?: readonly TableauMetadataOmissionSummary[];
  envelopeSummary: DiscoveryEnvelopeSummary;
  permissionSummary: DiscoveryPermissionSummary;
  safeMessage?: string;
}): JsonObject {
  return sanitizeJsonObject({
    source: "tableau_metadata_trace_safe_summary",
    requestId: input.input.request.requestId,
    correlationId: input.input.request.correlationId,
    agentRunId: input.input.request.agentRunId,
    toolName: input.input.toolName,
    status: input.status,
    transportStatus: input.input.transportResult?.status,
    transportKind:
      input.input.transportResult?.transportKind ??
      readTransportKind(input.input.request.metadata?.transportKind) ??
      "unknown",
    truncated: input.envelopeSummary.truncated,
    limitApplied: input.envelopeSummary.limitApplied,
    returnedCount: input.envelopeSummary.returnedCount,
    totalCountKnown: input.envelopeSummary.totalCountKnown,
    totalCount: input.envelopeSummary.totalCount,
    omittedCountKnown: input.envelopeSummary.omittedCountKnown,
    omittedCount: input.envelopeSummary.omittedCount,
    omissionReasons: input.envelopeSummary.omissionReasons,
    truncationReason: input.envelopeSummary.truncationReason,
    permissionLimited: input.permissionSummary.permissionLimited,
    permissionStatus: input.permissionSummary.permissionStatus,
    permissionNotes: input.permissionSummary.permissionNotes,
    warningCodes: input.warnings.map((warning) => warning.code),
    warningCount: input.warnings.length,
    errorCode: input.error?.code,
    fakeNoNetwork:
      input.input.transportResult?.transportKind === "fake" ||
      input.input.request.metadata?.noNetwork === true,
    safeMessage: input.safeMessage,
    metadata: sanitizeJsonObject({
      source: "tableau_metadata_trace_safe_summary",
      transportEventId: input.input.transportResult?.trace?.transportEventId,
      remoteTraceId: input.input.transportResult?.trace?.remoteTraceId,
      hostedSessionId: input.input.transportResult?.trace?.hostedSessionId,
      transportStatus: input.input.transportResult?.status,
      preconditionStatus: input.input.precondition.status,
      warningCount: input.warnings.length,
      ...(input.error?.code ? { errorCode: input.error.code } : {}),
      ...(input.safeMessage ? { safeMessage: input.safeMessage } : {}),
    }),
  });
}

function buildTraceTransportContext(
  input: TableauMetadataOutputNormalizationInput,
): {
  requestedTransportKind?: TableauMcpTransportKind;
  selectedTransportKind?: TableauMcpTransportKind;
  fallbackUsed?: boolean;
  fallbackFrom?: TableauMcpTransportKind;
  fallbackTo?: TableauMcpTransportKind;
  hostedFeatureEnabled?: boolean;
  noNetworkRequested?: boolean;
} {
  const requestMetadata = isJsonObject(input.request.metadata)
    ? input.request.metadata
    : undefined;
  const transportMetadata = isJsonObject(input.transportResult?.metadata)
    ? input.transportResult?.metadata
    : undefined;
  const traceMetadata = isJsonObject(input.transportResult?.trace?.metadata)
    ? input.transportResult?.trace?.metadata
    : undefined;
  const metadataSources = [requestMetadata, transportMetadata, traceMetadata];

  return {
    requestedTransportKind: readTransportKindFromMetadata(
      metadataSources,
      "requestedTransportKind",
    ),
    selectedTransportKind: readTransportKindFromMetadata(
      metadataSources,
      "selectedTransportKind",
    ),
    fallbackUsed: readBooleanFromMetadata(metadataSources, "fallbackUsed"),
    fallbackFrom: readTransportKindFromMetadata(
      metadataSources,
      "fallbackFrom",
    ),
    fallbackTo: readTransportKindFromMetadata(metadataSources, "fallbackTo"),
    hostedFeatureEnabled: readBooleanFromMetadata(
      metadataSources,
      "hostedFeatureEnabled",
    ),
    noNetworkRequested: readBooleanFromMetadata(
      metadataSources,
      "noNetworkRequested",
    ),
  };
}

type DiscoveryEnvelopeSummary = {
  truncated?: boolean;
  limitApplied?: number;
  returnedCount?: number;
  totalCountKnown?: boolean;
  totalCount?: number;
  omittedCountKnown?: boolean;
  omittedCount?: number;
  omissionReasons?: readonly TableauMetadataOmissionReason[];
  truncationReason?: TableauMetadataOmissionReason;
  permissionLimited?: boolean;
  permissionStatus?: TableauMetadataPermissionStatus;
  permissionNotes?: readonly string[];
  safeMessage?: string;
};

type DiscoveryPermissionSummary = {
  permissionLimited?: boolean;
  permissionStatus?: TableauMetadataPermissionStatus;
  permissionNotes?: readonly string[];
};

function buildDiscoveryWarnings(
  output: TableauDescribeDatasourceOutput | TableauListFieldsOutput,
  toolName: string,
  precondition: TableauMetadataPreconditionResult,
): TableauMetadataWarningSummary[] {
  const warnings: TableauMetadataWarningSummary[] = [];
  const envelope = buildDiscoveryEnvelopeSummary(
    output,
    toolName,
    normalizeTruncation(output.truncation),
    normalizeOmissions(output.omissions),
    buildPermissionSummary(precondition),
  );
  const hasTruncationWarning =
    output.warnings?.some((warning) => {
      const code = normalizeWarningCode(warning.code ?? "UNKNOWN_WARNING");
      return code === "OUTPUT_TRUNCATED" || code === "FIELD_LIST_TRUNCATED";
    }) ?? false;

  if (envelope.truncated && !hasTruncationWarning) {
    warnings.push({
      code:
        toolName === "tableau.metadata.listFields"
          ? "FIELD_LIST_TRUNCATED"
          : "OUTPUT_TRUNCATED",
      message:
        toolName === "tableau.metadata.listFields"
          ? "The field list was truncated to stay within safe bounds."
          : "The metadata response was truncated to stay within safe bounds.",
      metadata: sanitizeJsonObject({
        source: "tableau_metadata_output_normalization",
        limitApplied: envelope.limitApplied,
        returnedCount: envelope.returnedCount,
        totalCountKnown: envelope.totalCountKnown,
        totalCount: envelope.totalCount,
      }),
    });
  }

  const hasPermissionWarning =
    precondition.warnings?.some(
      (warning) =>
        normalizeWarningCode(warning.code) === "PERMISSION_NOT_VERIFIED",
    ) ?? false;

  if (envelope.permissionStatus === "unknown" && !hasPermissionWarning) {
    warnings.push({
      code: "PERMISSION_NOT_VERIFIED",
      message:
        "Permission could not be fully verified, so some metadata may be omitted.",
      metadata: sanitizeJsonObject({
        source: "tableau_metadata_output_normalization",
        permissionStatus: envelope.permissionStatus,
      }),
    });
  }

  return warnings;
}

function buildDiscoveryEnvelopeSummary(
  output: TableauDescribeDatasourceOutput | TableauListFieldsOutput,
  toolName: string,
  truncation: TableauMetadataTruncationSummary | undefined,
  omissions: readonly TableauMetadataOmissionSummary[] | undefined,
  permissionSummary: DiscoveryPermissionSummary,
): DiscoveryEnvelopeSummary {
  const listFieldSummary =
    toolName === "tableau.metadata.listFields"
      ? (output as TableauListFieldsOutput).fieldCountSummary
      : undefined;
  const describeFieldSummary =
    toolName === "tableau.metadata.describeDatasource"
      ? (output as TableauDescribeDatasourceOutput).fieldsSummary
      : undefined;
  const returnedCount =
    listFieldSummary?.returned ??
    describeFieldSummary?.returnedSampleCount ??
    truncation?.returned;
  const totalCount =
    listFieldSummary?.totalAvailable ??
    describeFieldSummary?.totalFields ??
    truncation?.totalAvailable;
  const totalCountKnown = typeof totalCount === "number";
  const truncated =
    truncation?.truncated ??
    Boolean(
      toolName === "tableau.metadata.listFields"
        ? listFieldSummary &&
            typeof listFieldSummary.totalAvailable === "number" &&
            typeof listFieldSummary.returned === "number" &&
            listFieldSummary.returned < listFieldSummary.totalAvailable
        : describeFieldSummary &&
            typeof describeFieldSummary.totalFields === "number" &&
            typeof describeFieldSummary.returnedSampleCount === "number" &&
            describeFieldSummary.returnedSampleCount <
              describeFieldSummary.totalFields,
    );
  const limitApplied =
    truncation?.limit ??
    (toolName === "tableau.metadata.listFields"
      ? listFieldSummary?.returned
      : describeFieldSummary?.returnedSampleCount);
  const truncationReason =
    truncation?.reason ??
    (truncated
      ? toolName === "tableau.metadata.listFields"
        ? "field_limit"
        : "output_limit"
      : undefined);
  const omissionReasons = dedupeOmissionReasons(omissions);
  if (truncationReason && !omissionReasons.includes(truncationReason)) {
    omissionReasons.push(truncationReason);
  }
  const omittedCountFromOmissions =
    calculateOmittedCountFromOmissions(omissions);
  const omittedCount =
    omittedCountFromOmissions ??
    (totalCountKnown && typeof returnedCount === "number"
      ? Math.max(0, totalCount - returnedCount)
      : undefined);
  const omittedCountKnown =
    omittedCount !== undefined ||
    omittedCountFromOmissions !== undefined ||
    (totalCountKnown && typeof returnedCount === "number");
  const safeMessage = buildDiscoverySafeMessage(
    toolName,
    truncated,
    permissionSummary.permissionNotes,
  );

  return {
    truncated,
    ...(typeof limitApplied === "number" ? { limitApplied } : {}),
    ...(typeof returnedCount === "number" ? { returnedCount } : {}),
    totalCountKnown,
    ...(totalCountKnown ? { totalCount: totalCount } : {}),
    omittedCountKnown,
    ...(typeof omittedCount === "number" ? { omittedCount } : {}),
    ...(omissionReasons.length ? { omissionReasons } : {}),
    ...(truncationReason ? { truncationReason } : {}),
    ...(safeMessage ? { safeMessage } : {}),
    permissionLimited: permissionSummary.permissionLimited,
    permissionStatus: permissionSummary.permissionStatus,
    ...(permissionSummary.permissionNotes?.length
      ? { permissionNotes: [...permissionSummary.permissionNotes] }
      : {}),
  };
}

function buildDiscoverySafeMessage(
  toolName: string,
  truncated: boolean,
  permissionNotes?: readonly string[],
): string | undefined {
  const messages: string[] = [];

  if (truncated) {
    messages.push(
      toolName === "tableau.metadata.listFields"
        ? "The field list was truncated to stay within safe bounds."
        : "The metadata response was truncated to stay within safe bounds.",
    );
  }

  if (permissionNotes?.length) {
    messages.push(...permissionNotes);
  }

  return messages.length > 0 ? messages.join(" ") : undefined;
}

function buildPermissionSummary(
  precondition: TableauMetadataPreconditionResult,
): DiscoveryPermissionSummary {
  const permission = precondition.governance?.permission;

  switch (permission) {
    case "verified":
      return {
        permissionLimited: false,
        permissionStatus: "verified",
      };
    case "blocked":
      return {
        permissionLimited: true,
        permissionStatus: "limited",
        permissionNotes: [
          "Some metadata may be omitted because permissions are restricted.",
        ],
      };
    case "not_verified":
    case "not_checked":
    default:
      return {
        permissionLimited: true,
        permissionStatus: "unknown",
        permissionNotes: [
          "Permission could not be fully verified, so some metadata may be omitted.",
        ],
      };
  }
}

function dedupeOmissionReasons(
  omissions: readonly TableauMetadataOmissionSummary[] | undefined,
): TableauMetadataOmissionReason[] {
  if (!omissions?.length) {
    return [];
  }

  const seen = new Set<string>();
  const reasons: TableauMetadataOmissionReason[] = [];

  for (const omission of omissions) {
    if (!omission.reason) {
      continue;
    }
    const reason = normalizeOmissionReason(omission.reason);
    if (seen.has(reason)) {
      continue;
    }
    seen.add(reason);
    reasons.push(reason);
  }

  return reasons;
}

function calculateOmittedCountFromOmissions(
  omissions: readonly TableauMetadataOmissionSummary[] | undefined,
): number | undefined {
  if (!omissions?.length) {
    return undefined;
  }

  let total = 0;
  let sawKnownCount = false;

  for (const omission of omissions) {
    if (
      typeof omission.count !== "number" ||
      !Number.isFinite(omission.count)
    ) {
      return undefined;
    }
    sawKnownCount = true;
    total += omission.count;
  }

  return sawKnownCount ? total : undefined;
}

function normalizeOmissionReason(
  reason: TableauMetadataOmissionReason | string,
): TableauMetadataOmissionReason {
  switch (reason) {
    case "output_limit":
    case "field_limit":
    case "permission":
    case "not_requested":
    case "not_available":
    case "hidden_by_default":
    case "technical_metadata_disabled":
    case "unknown":
      return reason;
    default:
      return "unknown";
  }
}

function readTransportKindFromMetadata(
  metadataSources: readonly (JsonObject | undefined)[],
  key: string,
): TableauMcpTransportKind | undefined {
  for (const metadata of metadataSources) {
    if (!metadata) {
      continue;
    }
    const candidate = readTransportKind(metadata[key]);
    if (candidate) {
      return candidate;
    }
  }

  return undefined;
}

function readBooleanFromMetadata(
  metadataSources: readonly (JsonObject | undefined)[],
  key: string,
): boolean | undefined {
  for (const metadata of metadataSources) {
    if (!metadata) {
      continue;
    }
    const value = metadata[key];
    if (typeof value === "boolean") {
      return value;
    }
  }

  return undefined;
}

function buildSummary(
  output: TableauDescribeDatasourceOutput | TableauListFieldsOutput,
  toolName: string,
): JsonObject {
  if (toolName === "tableau.metadata.describeDatasource") {
    const describeOutput = output as TableauDescribeDatasourceOutput;
    return sanitizeJsonObject({
      status: describeOutput.status,
      datasource: sanitizeDatasourceSummary(describeOutput.summary),
      fieldsSummary: sanitizeJsonValue(describeOutput.fieldsSummary),
      connectionSummary: sanitizeJsonValue(describeOutput.connectionSummary),
    });
  }

  const listOutput = output as TableauListFieldsOutput;
  return sanitizeJsonObject({
    status: listOutput.status,
    datasource: sanitizeDatasourceSummary(listOutput.datasource),
    fields: sanitizeFieldSummaries(listOutput.fields),
    fieldCountSummary: sanitizeJsonValue(listOutput.fieldCountSummary),
  });
}

function sanitizeDatasourceSummary(
  value: TableauDescribeDatasourceOutput["summary"] | undefined,
): JsonObject | undefined {
  if (!value) {
    return undefined;
  }

  return sanitizeJsonObject({
    datasourceId: value.datasourceId,
    datasourceName: value.datasourceName,
    projectId: value.projectId,
    projectName: value.projectName,
    workbookId: value.workbookId,
    workbookName: value.workbookName,
    siteId: value.siteId,
    siteName: value.siteName,
    ownerName: value.ownerName,
    connectionType: value.connectionType,
    isExtract: value.isExtract,
    fieldCount: value.fieldCount,
    visibleFieldCount: value.visibleFieldCount,
    hiddenFieldCount: value.hiddenFieldCount,
    lastUpdatedAt: value.lastUpdatedAt,
    metadata: sanitizeJsonValue(value.metadata),
  });
}

function sanitizeFieldSummaries(
  fields: TableauListFieldsOutput["fields"] | undefined,
): JsonValue[] | undefined {
  if (!fields) {
    return undefined;
  }

  return fields.map((field) =>
    sanitizeJsonObject({
      fieldId: field.fieldId,
      fieldName: field.fieldName,
      caption: field.caption,
      role: field.role,
      dataType: field.dataType,
      isHidden: field.isHidden,
      isCalculated: field.isCalculated,
      defaultAggregation: field.defaultAggregation,
      semanticRole: field.semanticRole,
      description: field.description,
      metadata: sanitizeJsonValue(field.metadata),
    }),
  );
}

type TableauMetadataWarningLike = {
  code?: TableauMetadataWarningSummary["code"] | string;
  message: string;
  target?: string;
  metadata?: JsonObject;
};

type TableauMetadataErrorLike =
  | TableauMetadataErrorSummary
  | TableauMcpTransportError
  | undefined;

function normalizeWarnings(
  warnings: readonly TableauMetadataWarningLike[],
): TableauMetadataWarningSummary[] {
  const seen = new Set<string>();
  const result: TableauMetadataWarningSummary[] = [];

  for (const warning of warnings) {
    const normalized = {
      code: normalizeWarningCode(warning.code ?? "UNKNOWN_WARNING"),
      message: warning.message,
      ...(warning.target ? { target: warning.target } : {}),
      ...(warning.metadata
        ? { metadata: sanitizeJsonObject(warning.metadata) }
        : {}),
    } satisfies TableauMetadataWarningSummary;
    const key = `${normalized.code}:${normalized.message}:${normalized.target ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function normalizeError(
  error: TableauMetadataErrorLike,
  precondition: TableauMetadataPreconditionResult,
  status: TableauMetadataNormalizedStatus,
  transportStatus: TableauMcpTransportStatus | undefined,
  input: TableauMetadataOutputNormalizationInput,
): TableauMetadataErrorSummary | undefined {
  if (!error) {
    if (status === "blocked") {
      return {
        code: mapPreconditionStatusToErrorCode(precondition.status),
        message:
          precondition.userFacingMessage ??
          precondition.message ??
          "The Tableau metadata request was blocked before execution.",
        retryable: false,
        userActionRequired: true,
        metadata: sanitizeJsonObject({
          source: "tableau_metadata_output_normalization",
          preconditionStatus: precondition.status,
          failureCode:
            precondition.failureCode ?? "UNKNOWN_PRECONDITION_FAILURE",
        }),
      };
    }

    if (status === "failed") {
      return {
        code: normalizeTransportFailureCode(transportStatus),
        message: "The Tableau metadata request failed.",
        retryable: false,
        userActionRequired: true,
        metadata: sanitizeJsonObject({
          source: "tableau_metadata_output_normalization",
          preconditionStatus: precondition.status,
          transportStatus,
        }),
      };
    }

    return undefined;
  }

  const hostedErrorSummary = isHostedTransportKind(
    input.transportResult?.transportKind,
  )
    ? normalizeHostedMcpMetadataError({
        toolName: input.toolName,
        operation:
          input.toolName === "tableau.metadata.listFields"
            ? "listFields"
            : input.toolName === "tableau.metadata.describeDatasource"
              ? "describeDatasource"
              : "unknown",
        transportKind: input.transportResult?.transportKind,
        transportStatus,
        code: error.code,
        retryable: error.retryable,
        userActionRequired: error.userActionRequired,
        target: "target" in error ? error.target : undefined,
        requestId: input.request.requestId,
        correlationId: input.request.correlationId,
        agentRunId: input.request.agentRunId,
        metadata: error.metadata,
      })
    : undefined;

  return {
    ...(hostedErrorSummary
      ? hostedErrorSummary
      : {
          code: normalizeErrorCode(error.code),
          message: error.message,
          ...(error.retryable !== undefined
            ? { retryable: error.retryable }
            : {}),
          ...(error.userActionRequired !== undefined
            ? { userActionRequired: error.userActionRequired }
            : {}),
          ...("target" in error && error.target
            ? { target: error.target }
            : {}),
          ...(error.metadata
            ? { metadata: sanitizeJsonObject(error.metadata) }
            : {}),
        }),
  };
}

function normalizeTruncation(
  truncation: TableauMetadataTruncationSummary | undefined,
): TableauMetadataTruncationSummary | undefined {
  if (!truncation) {
    return undefined;
  }

  return {
    truncated: Boolean(truncation.truncated),
    ...(typeof truncation.limit === "number"
      ? { limit: truncation.limit }
      : {}),
    ...(typeof truncation.returned === "number"
      ? { returned: truncation.returned }
      : {}),
    ...(typeof truncation.totalAvailable === "number"
      ? { totalAvailable: truncation.totalAvailable }
      : {}),
    ...(truncation.reason ? { reason: truncation.reason } : {}),
  };
}

function normalizeOmissions(
  omissions: readonly TableauMetadataOmissionSummary[] | undefined,
): readonly TableauMetadataOmissionSummary[] | undefined {
  if (!omissions?.length) {
    return undefined;
  }

  return omissions.map((omission) => ({
    omitted: Boolean(omission.omitted),
    ...(omission.reason ? { reason: omission.reason } : {}),
    ...(omission.message ? { message: omission.message } : {}),
    ...(typeof omission.count === "number" ? { count: omission.count } : {}),
  }));
}

function normalizeResolution(
  resolution: TableauMetadataResolutionSummary | undefined,
): TableauMetadataResolutionSummary | undefined {
  if (!resolution) {
    return undefined;
  }

  return {
    status: resolution.status,
    target: resolution.target,
    ...(resolution.selectedId ? { selectedId: resolution.selectedId } : {}),
    ...(resolution.selectedName
      ? { selectedName: resolution.selectedName }
      : {}),
    ...(resolution.candidates
      ? {
          candidates: resolution.candidates.map((candidate) =>
            sanitizeJsonObject({
              id: candidate.id,
              name: candidate.name,
              type: candidate.type,
              projectName: candidate.projectName,
              workbookName: candidate.workbookName,
              datasourceName: candidate.datasourceName,
              confidence: candidate.confidence,
              metadata: sanitizeJsonValue(candidate.metadata),
            }),
          ),
        }
      : {}),
    ...(resolution.message ? { message: resolution.message } : {}),
    ...(resolution.metadata
      ? { metadata: sanitizeJsonObject(resolution.metadata) }
      : {}),
  };
}

function normalizeStatus(
  precondition: TableauMetadataPreconditionResult,
  outputStatus:
    | TableauDescribeDatasourceOutput["status"]
    | TableauListFieldsOutput["status"]
    | undefined,
  transportStatus: TableauMcpTransportStatus | undefined,
): TableauMetadataNormalizedStatus {
  if (!precondition.canExecute) {
    return "blocked";
  }

  if (outputStatus === "partial") {
    return "partial";
  }

  if (outputStatus === "failed") {
    return "failed";
  }

  switch (transportStatus) {
    case "success":
      return "success";
    case "partial":
      return "partial";
    case "timeout":
    case "cancelled":
    case "unsupported":
    case "not_configured":
    case "failed":
    default:
      return "failed";
  }
}

function normalizeTransportFailureCode(
  status: TableauMcpTransportStatus | undefined,
): TableauMetadataErrorSummary["code"] {
  switch (status) {
    case "timeout":
      return "TIMEOUT";
    case "not_configured":
      return "TRANSPORT_NOT_CONFIGURED";
    case "unsupported":
      return "TRANSPORT_FAILED";
    case "cancelled":
      return "TRANSPORT_FAILED";
    case "success":
    case "partial":
    case "failed":
    default:
      return "TRANSPORT_FAILED";
  }
}

function mapPreconditionStatusToErrorCode(
  status: TableauMetadataPreconditionStatus,
): TableauMetadataErrorSummary["code"] {
  switch (status) {
    case "blocked":
      return "INVALID_INPUT";
    case "warning":
    case "passed":
    case "not_checked":
    default:
      return "UNKNOWN_ERROR";
  }
}

function normalizeWarningCode(
  code: TableauMetadataWarningSummary["code"] | string,
): TableauMetadataWarningSummary["code"] {
  switch (code) {
    case "AMBIGUOUS_DATASOURCE":
    case "MISSING_DATASOURCE_IDENTIFIER":
    case "OUTPUT_TRUNCATED":
    case "FIELD_LIST_TRUNCATED":
    case "HIDDEN_FIELDS_OMITTED":
    case "TECHNICAL_METADATA_OMITTED":
    case "TRANSPORT_WARNING":
    case "PERMISSION_NOT_VERIFIED":
    case "SITE_SETTINGS_NOT_VERIFIED":
    case "UNKNOWN_WARNING":
      return code;
    default:
      return "UNKNOWN_WARNING";
  }
}

function normalizeErrorCode(
  code: TableauMetadataErrorSummary["code"] | string,
): TableauMetadataErrorSummary["code"] {
  switch (code) {
    case "INVALID_INPUT":
    case "MISSING_REQUIRED_IDENTIFIER":
    case "AMBIGUOUS_IDENTIFIER":
    case "NOT_FOUND":
    case "AUTH_REQUIRED":
    case "AUTH_EXPIRED":
    case "PERMISSION_DENIED":
    case "SITE_SETTINGS_DISABLED":
    case "TRANSPORT_NOT_CONFIGURED":
    case "NETWORK_ERROR":
    case "MCP_PROTOCOL_ERROR":
    case "TOOL_NOT_FOUND":
    case "REMOTE_SERVER_ERROR":
    case "TRANSPORT_FAILED":
    case "TIMEOUT":
    case "UNKNOWN_ERROR":
      return code;
    default:
      switch (code) {
        case "INVALID_TOOL_INPUT":
          return "INVALID_INPUT";
        case "AUTH_EXPIRED":
          return "AUTH_EXPIRED";
        case "AUTH_REQUIRED":
          return "AUTH_REQUIRED";
        case "PERMISSION_DENIED":
          return "PERMISSION_DENIED";
        case "SITE_SETTINGS_DISABLED":
          return "SITE_SETTINGS_DISABLED";
        case "NETWORK_ERROR":
          return "NETWORK_ERROR";
        case "MCP_PROTOCOL_ERROR":
          return "MCP_PROTOCOL_ERROR";
        case "REMOTE_SERVER_ERROR":
          return "REMOTE_SERVER_ERROR";
        case "TOOL_NOT_FOUND":
          return "TOOL_NOT_FOUND";
        case "STDIO_PROCESS_ERROR":
        case "UNSUPPORTED_TRANSPORT":
          return "TRANSPORT_FAILED";
        default:
          return "UNKNOWN_ERROR";
      }
  }
}

function isHostedTransportKind(
  transportKind: TableauMcpTransportKind | undefined,
): transportKind is "hosted" | "remote" {
  return transportKind === "hosted" || transportKind === "remote";
}

function readTransportKind(
  value: unknown,
): TableauMcpTransportKind | undefined {
  switch (value) {
    case "stdio":
    case "hosted":
    case "remote":
    case "fake":
    case "unknown":
      return value;
    default:
      return undefined;
  }
}

function isTableauMetadataOutputCandidate(
  value: unknown,
  toolName: string,
): value is TableauDescribeDatasourceOutput | TableauListFieldsOutput {
  if (!isJsonObject(value)) {
    return false;
  }

  if (toolName === "tableau.metadata.describeDatasource") {
    return "summary" in value || "connectionSummary" in value;
  }

  return "fields" in value || "fieldCountSummary" in value;
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeJsonObject(value: Record<string, unknown>): JsonObject {
  const sanitized = sanitizeJsonValue(value);
  if (sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)) {
    return sanitized as JsonObject;
  }

  return {};
}

function sanitizeJsonValue(
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
  depth = 0,
): JsonValue | undefined {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    if (typeof value === "string" && value.length > MAX_STRING_LENGTH) {
      return `${value.slice(0, MAX_STRING_LENGTH)}...[Truncated]`;
    }
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (
    typeof value === "undefined" ||
    typeof value === "function" ||
    typeof value === "symbol"
  ) {
    return undefined;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return sanitizeJsonObject({
      name: value.name,
      message: value.message,
    });
  }

  if (value instanceof Map) {
    if (depth >= MAX_JSON_DEPTH) {
      return "[Truncated]";
    }

    const entries: JsonValue[] = [];
    for (const [key, item] of value.entries()) {
      if (entries.length >= MAX_JSON_ENTRIES) {
        break;
      }
      const sanitizedItem = sanitizeJsonValue(item, seen, depth + 1);
      if (sanitizedItem !== undefined) {
        entries.push(
          sanitizeJsonObject({
            key: sanitizeJsonValue(key, seen, depth + 1),
            value: sanitizedItem,
          }),
        );
      }
    }

    return entries;
  }

  if (value instanceof Set) {
    if (depth >= MAX_JSON_DEPTH) {
      return "[Truncated]";
    }

    const items: JsonValue[] = [];
    for (const item of value.values()) {
      if (items.length >= MAX_JSON_ENTRIES) {
        break;
      }
      const sanitizedItem = sanitizeJsonValue(item, seen, depth + 1);
      if (sanitizedItem !== undefined) {
        items.push(sanitizedItem);
      }
    }

    return items;
  }

  if (Array.isArray(value)) {
    if (depth >= MAX_JSON_DEPTH) {
      return "[Truncated]";
    }

    const items: JsonValue[] = [];
    for (const item of value) {
      if (items.length >= MAX_JSON_ENTRIES) {
        break;
      }
      const sanitizedItem = sanitizeJsonValue(item, seen, depth + 1);
      if (sanitizedItem !== undefined) {
        items.push(sanitizedItem);
      }
    }

    return items;
  }

  if (typeof value === "object") {
    if (seen.has(value)) {
      return "[Circular]";
    }

    if (depth >= MAX_JSON_DEPTH) {
      return "[Truncated]";
    }

    seen.add(value);
    const result: JsonObject = {};
    for (const [key, item] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (FORBIDDEN_METADATA_KEYS.has(key)) {
        continue;
      }

      if (Object.keys(result).length >= MAX_JSON_ENTRIES) {
        break;
      }

      const sanitizedItem = sanitizeJsonValue(item, seen, depth + 1);
      if (sanitizedItem !== undefined) {
        result[key] = sanitizedItem;
      }
    }

    return result;
  }

  return undefined;
}
