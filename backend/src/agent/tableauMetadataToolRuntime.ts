import { createDefaultToolExecutionWrapper } from "./toolExecutionWrapper";
import { InMemoryToolRegistry } from "./toolRegistry";
import {
  createHostedMcpAuthContextAdapter,
  type HostedMcpAuthContextAdapterResult,
} from "./hostedMcpAuthContextAdapter";
import type { JsonObject, JsonValue } from "./types";
import {
  cloneMetadataJson,
  normalizeMaxItems,
  type TableauDescribeDatasourceInput,
  type TableauDescribeDatasourceOutput,
  type TableauFieldSummary,
  type TableauListFieldsInput,
  type TableauListFieldsOutput,
  type TableauMetadataErrorCode,
  type TableauMetadataErrorSummary,
  type TableauMetadataOmissionSummary,
  type TableauMetadataResolutionSummary,
  type TableauMetadataTruncationSummary,
  type TableauMetadataWarningSummary,
} from "./tableauMetadataSchemas";
import {
  normalizeTableauMetadataExecutionResult,
  type TableauMetadataNormalizedResult,
} from "./tableauMetadataOutputNormalization";
import {
  createTableauMetadataToolDefinitions,
  TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME,
  TABLEAU_METADATA_LIST_FIELDS_TOOL_NAME,
} from "./tableauMetadataTools";
import {
  evaluateTableauMetadataToolPreconditions,
  TABLEAU_METADATA_ALLOWED_TOOL_NAMES,
  type TableauMetadataPreconditionInput,
  type TableauMetadataPreconditionResult,
  type TableauMetadataToolPolicy,
  type TableauMetadataTransportKind,
} from "./tableauMetadataPreconditions";
import { logError, logInfo, logWarn } from "../logging";
import type {
  ToolExecutionHandler,
  ToolExecutionInput,
} from "./toolExecutionWrapper";

export type TableauMcpTransportKind =
  | "stdio"
  | "hosted"
  | "remote"
  | "fake"
  | "unknown";

export type TableauMcpTransportStatus =
  | "success"
  | "partial"
  | "failed"
  | "timeout"
  | "cancelled"
  | "unsupported"
  | "not_configured";

export type TableauMcpUserContextSummary = {
  userId?: string;
  tableauUserId?: string;
  email?: string;
  siteId?: string;
  siteName?: string;
  siteContentUrl?: string;
  locale?: string;
  source?: "cognito" | "tableau" | "fake" | "unknown";
  metadata?: JsonObject;
};

export type TableauMcpAuthContextSummary = {
  mode:
    | "none"
    | "direct_trust"
    | "oauth_delegated"
    | "token_reference"
    | "fake"
    | "unknown";
  state?: "ready" | "missing" | "expired" | "unknown" | "not_configured";
  reasonCode?:
    | "AUTH_REQUIRED"
    | "AUTH_EXPIRED"
    | "AUTH_STATE_UNKNOWN"
    | "HOSTED_AUTH_NOT_CONFIGURED"
    | "SITE_SETTINGS_DISABLED"
    | "TOKEN_REFERENCE_MISSING";
  userActionRequired?: boolean;
  retryable?: boolean;
  tokenReference?: string;
  scopes?: readonly string[];
  expiresAt?: string;
  metadata?: JsonObject;
};

export type TableauMcpTransportWarning = {
  code?: string;
  message: string;
  source?: string;
  metadata?: JsonObject;
};

export type TableauMcpTransportErrorCode =
  | "TRANSPORT_NOT_CONFIGURED"
  | "UNSUPPORTED_TRANSPORT"
  | "AUTH_REQUIRED"
  | "AUTH_EXPIRED"
  | "PERMISSION_DENIED"
  | "SITE_SETTINGS_DISABLED"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "MCP_PROTOCOL_ERROR"
  | "TOOL_NOT_FOUND"
  | "INVALID_TOOL_INPUT"
  | "REMOTE_SERVER_ERROR"
  | "STDIO_PROCESS_ERROR"
  | "UNKNOWN_ERROR";

export type TableauMcpTransportError = {
  code: TableauMcpTransportErrorCode;
  message: string;
  retryable?: boolean;
  userActionRequired?: boolean;
  source?: string;
  metadata?: JsonObject;
};

export type TableauMcpTransportTraceMetadata = {
  correlationId?: string;
  agentRunId?: string;
  transportEventId?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  transportKind?: TableauMcpTransportKind;
  toolName?: string;
  attemptCount?: number;
  remoteTraceId?: string;
  stdioProcessIdAvailable?: boolean;
  hostedSessionId?: string;
  metadata?: JsonObject;
};

export type TableauMcpTransportTiming = {
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  timeoutMs?: number;
  timedOut?: boolean;
};

export type TableauMcpTransportTraceOptions = {
  correlationId?: string;
  agentRunId?: string;
  toolName?: string;
  metadata?: JsonObject;
};

export type TableauMcpTransportRequest = {
  requestId: string;
  toolName: string;
  input: JsonObject;
  timeoutMs?: number;
  correlationId?: string;
  agentRunId?: string;
  userContext?: TableauMcpUserContextSummary;
  authContext?: TableauMcpAuthContextSummary;
  trace?: TableauMcpTransportTraceOptions;
  metadata?: JsonObject;
};

export type TableauMcpTransportResult = {
  requestId: string;
  transportKind: TableauMcpTransportKind;
  status: TableauMcpTransportStatus;
  toolName: string;
  data?: unknown;
  warnings?: readonly TableauMcpTransportWarning[];
  error?: TableauMcpTransportError;
  trace?: TableauMcpTransportTraceMetadata;
  timing?: TableauMcpTransportTiming;
  metadata?: JsonObject;
};

export interface TableauMcpTransport {
  readonly kind: TableauMcpTransportKind;
  readonly name?: string;
  call(request: TableauMcpTransportRequest): Promise<TableauMcpTransportResult>;
}

export type TableauMetadataFakeExecutionContext = {
  preconditionInput?: Partial<TableauMetadataPreconditionInput>;
  transport?: TableauMcpTransport;
  now?: () => Date;
};

export type TableauMetadataToolRuntime = {
  registry: InMemoryToolRegistry;
  executionWrapper: ReturnType<typeof createDefaultToolExecutionWrapper>;
};

export type TableauMetadataExecutionBoundaryOptions = {
  transport?: TableauMcpTransport;
  hostedTransport?: TableauMcpTransport;
  now?: () => Date;
};

type TableauMetadataTransportSelection = {
  requestedTransportKind: TableauMcpTransportKind;
  selectedTransportKind: TableauMcpTransportKind;
  hostedFeatureEnabled: boolean;
  hostedTransportSelected: boolean;
  noNetworkRequested: boolean;
  fallbackUsed: boolean;
  fallbackFrom?: TableauMcpTransportKind;
  fallbackTo?: TableauMcpTransportKind;
};

const FAKE_TRANSPORT_WARNING: TableauMetadataWarningSummary = {
  code: "TRANSPORT_WARNING",
  message: "Fake no-network metadata result.",
  metadata: {
    transportKind: "fake",
    noNetwork: true,
    source: "fake_no_network",
    placeholder: true,
  },
};

const FAKE_DATASET = {
  datasourceId: "fake-datasource-id",
  datasourceName: "Fake Tableau Datasource",
  workbookId: "fake-workbook-id",
  workbookName: "Fake Workbook",
  siteId: "fake-site-id",
  siteName: "Fake Site",
  ownerName: "Fake Owner",
  connectionType: "fake",
  isExtract: false,
  fields: [
    {
      fieldId: "fake-field-region",
      fieldName: "Region",
      caption: "Region",
      role: "dimension",
      dataType: "string",
      isHidden: false,
      isCalculated: false,
      semanticRole: "location",
      description: "Fake region field for no-network testing.",
    },
    {
      fieldId: "fake-field-sales",
      fieldName: "Sales",
      caption: "Sales",
      role: "measure",
      dataType: "number",
      isHidden: false,
      isCalculated: false,
      defaultAggregation: "sum",
      semanticRole: "measure",
      description: "Fake sales field for no-network testing.",
    },
    {
      fieldId: "fake-field-order-date",
      fieldName: "Order Date",
      caption: "Order Date",
      role: "dimension",
      dataType: "date",
      isHidden: false,
      isCalculated: false,
      semanticRole: "temporal",
      description: "Fake order date field for no-network testing.",
    },
    {
      fieldId: "fake-field-internal-note",
      fieldName: "Internal Note",
      caption: "Internal Note",
      role: "dimension",
      dataType: "string",
      isHidden: true,
      isCalculated: false,
      semanticRole: "text",
      description: "Hidden fake field for truncation and omission tests.",
    },
  ] satisfies readonly TableauFieldSummary[],
} as const;

const FAKE_HANDLER_TOOL_POLICY: TableauMetadataToolPolicy = {
  allowedToolNames: [...TABLEAU_METADATA_ALLOWED_TOOL_NAMES],
  safeForPreviewOnly: true,
  readOnlyOnly: true,
  allowExternalAccess: true,
  allowUnderlyingDataAccess: false,
  allowWriteOperations: false,
};

const DEFAULT_SITE_IDENTIFIER = {
  siteId: FAKE_DATASET.siteId,
  siteName: FAKE_DATASET.siteName,
};

const DEFAULT_DATASOURCE_IDENTIFIER = {
  datasourceId: FAKE_DATASET.datasourceId,
  datasourceName: FAKE_DATASET.datasourceName,
  workbookId: FAKE_DATASET.workbookId,
  workbookName: FAKE_DATASET.workbookName,
  projectId: "fake-project-id",
  projectName: "Fake Project",
};

export function createTableauMetadataToolRegistry(): InMemoryToolRegistry {
  return new InMemoryToolRegistry(createTableauMetadataToolDefinitions());
}

export function createTableauMetadataToolRuntime(
  options: TableauMetadataExecutionBoundaryOptions = {},
): TableauMetadataToolRuntime {
  return {
    registry: createTableauMetadataToolRegistry(),
    executionWrapper: createDefaultToolExecutionWrapper({
      handlers: createTableauMetadataToolHandlers(options),
      defaultTimeoutMs: 5_000,
    }),
  };
}

export function createTableauMetadataToolHandlers(
  options: TableauMetadataExecutionBoundaryOptions = {},
): Record<string, ToolExecutionHandler> {
  const transport = options.transport ?? createFakeTableauMetadataTransport();
  const hostedTransport = options.hostedTransport;
  const now = options.now;

  return {
    [TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME]:
      createDescribeDatasourceFakeHandler({
        transport,
        hostedTransport,
        now,
      }),
    [TABLEAU_METADATA_LIST_FIELDS_TOOL_NAME]: createListFieldsFakeHandler({
      transport,
      now,
    }),
  };
}

export function createDescribeDatasourceFakeHandler(
  options: TableauMetadataExecutionBoundaryOptions = {},
): ToolExecutionHandler {
  return async (input) => {
    return executeDescribeDatasourceViaTransport(input, options);
  };
}

export function createListFieldsFakeHandler(
  options: TableauMetadataExecutionBoundaryOptions = {},
): ToolExecutionHandler {
  return async (input) => {
    return executeListFieldsViaTransport(input, options);
  };
}

export function createFakeTableauMetadataTransport(
  options: Pick<TableauMetadataExecutionBoundaryOptions, "now"> = {},
): TableauMcpTransport {
  return {
    kind: "fake",
    name: "fake-no-network-tableau-mcp-transport",
    async call(request) {
      const startedAt = nowIso(options.now);
      const transportTrace = buildTransportTraceMetadata(
        request,
        startedAt,
        startedAt,
        0,
        false,
      );
      const toolName = request.toolName;

      if (toolName === TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME) {
        const input =
          request.input as unknown as TableauDescribeDatasourceInput;
        const precondition = createFakeTransportPreconditionResult(
          request,
          "resolved",
        );
        const output = buildDescribeDatasourceSuccessOutput(
          input,
          precondition,
        );

        return {
          requestId: request.requestId,
          transportKind: "fake",
          status: "success",
          toolName,
          data: output,
          warnings: [FAKE_TRANSPORT_WARNING],
          trace: transportTrace,
          timing: {
            startedAt,
            completedAt: startedAt,
            durationMs: 0,
            timeoutMs: request.timeoutMs,
            timedOut: false,
          },
          metadata: buildExecutionMetadata({
            request,
            transportKind: "fake",
            transportStatus: "success",
            preconditionStatus: "passed",
            startedAt,
            completedAt: startedAt,
            durationMs: 0,
            warningCount: 1,
          }),
        };
      }

      if (toolName === TABLEAU_METADATA_LIST_FIELDS_TOOL_NAME) {
        const input = request.input as unknown as TableauListFieldsInput;
        const precondition = createFakeTransportPreconditionResult(
          request,
          "resolved",
        );
        const output = buildListFieldsSuccessOutput(input, precondition);

        return {
          requestId: request.requestId,
          transportKind: "fake",
          status: "success",
          toolName,
          data: output,
          warnings: [FAKE_TRANSPORT_WARNING],
          trace: transportTrace,
          timing: {
            startedAt,
            completedAt: startedAt,
            durationMs: 0,
            timeoutMs: request.timeoutMs,
            timedOut: false,
          },
          metadata: buildExecutionMetadata({
            request,
            transportKind: "fake",
            transportStatus: "success",
            preconditionStatus: "passed",
            startedAt,
            completedAt: startedAt,
            durationMs: 0,
            warningCount: 1,
          }),
        };
      }

      return {
        requestId: request.requestId,
        transportKind: "fake",
        status: "unsupported",
        toolName,
        warnings: [
          {
            code: "TRANSPORT_WARNING",
            message: `Tool '${toolName}' is not supported by the fake transport.`,
            source: "fake_no_network",
          },
        ],
        error: {
          code: "UNSUPPORTED_TRANSPORT",
          message: `Tool '${toolName}' is not supported by the fake transport.`,
          retryable: false,
          userActionRequired: true,
          source: "fake_no_network",
        },
        trace: transportTrace,
        timing: {
          startedAt,
          completedAt: startedAt,
          durationMs: 0,
          timeoutMs: request.timeoutMs,
          timedOut: false,
        },
        metadata: buildExecutionMetadata({
          request,
          transportKind: "fake",
          transportStatus: "unsupported",
          preconditionStatus: "passed",
          startedAt,
          completedAt: startedAt,
          durationMs: 0,
          warningCount: 1,
          errorCode: "UNSUPPORTED_TRANSPORT",
        }),
      };
    },
  };
}

async function executeDescribeDatasourceViaTransport(
  input: ToolExecutionInput,
  options: TableauMetadataExecutionBoundaryOptions,
): Promise<TableauMetadataNormalizedResult> {
  return executeTableauMetadataToolViaTransport(
    TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME,
    normalizeDescribeDatasourceInput(input.input, normalizeToolContext(input)),
    input,
    options,
    buildDescribeDatasourceSuccessOutput,
    buildDescribeDatasourceFailedOutput,
  );
}

async function executeListFieldsViaTransport(
  input: ToolExecutionInput,
  options: TableauMetadataExecutionBoundaryOptions,
): Promise<TableauMetadataNormalizedResult> {
  return executeTableauMetadataToolViaTransport(
    TABLEAU_METADATA_LIST_FIELDS_TOOL_NAME,
    normalizeListFieldsInput(input.input, normalizeToolContext(input)),
    input,
    options,
    buildListFieldsSuccessOutput,
    buildListFieldsFailedOutput,
  );
}

async function executeTableauMetadataToolViaTransport<
  TInput extends TableauDescribeDatasourceInput | TableauListFieldsInput,
  TOutput extends TableauDescribeDatasourceOutput | TableauListFieldsOutput,
>(
  toolName: string,
  normalizedInput: TInput,
  executionInput: ToolExecutionInput,
  options: TableauMetadataExecutionBoundaryOptions,
  successBuilder: (
    input: TInput,
    precondition: TableauMetadataPreconditionResult,
  ) => TOutput,
  failedBuilder: (
    input: TInput,
    precondition: TableauMetadataPreconditionResult,
  ) => TOutput,
): Promise<TableauMetadataNormalizedResult> {
  const transport =
    options.transport ?? createFakeTableauMetadataTransport(options);
  const hostedTransport = options.hostedTransport;
  const now = options.now ?? (() => new Date());
  const startedAt = now();
  const selection = buildTransportSelection(toolName, executionInput, {
    fallbackTransport: transport,
    hostedTransport,
  });
  const precondition = evaluateTableauMetadataToolPreconditions(
    buildPreconditionInput(
      executionInput,
      toolName,
      normalizedInput,
      selection,
    ),
  );
  const request = buildTransportRequest(
    toolName,
    normalizedInput,
    executionInput,
    precondition,
    selection,
  );
  const fallbackOutput = successBuilder(normalizedInput, precondition);
  const operation = getToolOperationName(toolName);

  logInfo("tableau.metadata.execution.started", {
    component: "tableau_metadata",
    operation,
    requestId: request.requestId,
    correlationId: request.correlationId,
    agentRunId: request.agentRunId,
    requestedTransportKind: selection.requestedTransportKind,
    selectedTransportKind: selection.selectedTransportKind,
    hostedFeatureEnabled: selection.hostedFeatureEnabled,
    fallbackUsed: selection.fallbackUsed,
    noNetworkRequested: selection.noNetworkRequested,
    result: "started",
    retryCount: 0,
  });

  if (!precondition.canExecute) {
    logWarn("tableau.metadata.execution.blocked", {
      component: "tableau_metadata",
      operation,
      requestId: request.requestId,
      correlationId: request.correlationId,
      agentRunId: request.agentRunId,
      requestedTransportKind: selection.requestedTransportKind,
      selectedTransportKind: selection.selectedTransportKind,
      hostedFeatureEnabled: selection.hostedFeatureEnabled,
      fallbackUsed: selection.fallbackUsed,
      noNetworkRequested: selection.noNetworkRequested,
      result: "failure",
      errorCode: mapPreconditionFailureToErrorCode(precondition.failureCode),
      durationMs: 0,
      retryCount: 0,
    });
    const fallback = withExecutionMetadata(
      failedBuilder(normalizedInput, precondition),
      buildExecutionMetadata({
        request,
        requestedTransportKind: selection.requestedTransportKind,
        selectedTransportKind: selection.selectedTransportKind,
        transportKind: selection.selectedTransportKind,
        transportStatus: "failed",
        preconditionStatus: precondition.status,
        hostedFeatureEnabled: selection.hostedFeatureEnabled,
        noNetworkRequested: selection.noNetworkRequested,
        fallbackUsed: selection.fallbackUsed,
        fallbackFrom: selection.fallbackFrom,
        fallbackTo: selection.fallbackTo,
        startedAt: startedAt.toISOString(),
        completedAt: startedAt.toISOString(),
        durationMs: 0,
        warningCount: precondition.warnings?.length ?? 0,
        errorCode: mapPreconditionFailureToErrorCode(precondition.failureCode),
      }),
      precondition.warnings ?? [],
    );

    return normalizeTableauMetadataExecutionResult({
      toolName,
      request,
      precondition,
      fallbackOutput: fallback,
      startedAt: startedAt.toISOString(),
      completedAt: startedAt.toISOString(),
    });
  }

  try {
    const activeTransport = selection.hostedTransportSelected
      ? (hostedTransport ?? transport)
      : transport;
    const transportResult = await activeTransport.call(request);
    const completedAt = now();
    const enrichedFallback =
      transportResult.status === "success" ||
      transportResult.status === "partial"
        ? withExecutionMetadata(
            fallbackOutput,
            buildExecutionMetadata({
              request,
              requestedTransportKind: selection.requestedTransportKind,
              selectedTransportKind: selection.selectedTransportKind,
              transportKind: transportResult.transportKind,
              transportStatus: transportResult.status,
              preconditionStatus: precondition.status,
              hostedFeatureEnabled: selection.hostedFeatureEnabled,
              fallbackUsed: selection.fallbackUsed,
              fallbackFrom: selection.fallbackFrom,
              fallbackTo: selection.fallbackTo,
              startedAt:
                transportResult.trace?.startedAt ?? startedAt.toISOString(),
              completedAt:
                transportResult.trace?.completedAt ?? completedAt.toISOString(),
              durationMs:
                transportResult.trace?.durationMs ??
                Math.max(0, completedAt.getTime() - startedAt.getTime()),
              timeoutMs: request.timeoutMs,
              warningCount: transportResult.warnings?.length ?? 0,
              errorCode: transportResult.error?.code,
              transportResult,
            }),
          )
        : withExecutionMetadata(
            failedBuilder(normalizedInput, precondition),
            buildExecutionMetadata({
              request,
              requestedTransportKind: selection.requestedTransportKind,
              selectedTransportKind: selection.selectedTransportKind,
              transportKind: transportResult.transportKind,
              transportStatus: transportResult.status,
              preconditionStatus: precondition.status,
              hostedFeatureEnabled: selection.hostedFeatureEnabled,
              fallbackUsed: selection.fallbackUsed,
              fallbackFrom: selection.fallbackFrom,
              fallbackTo: selection.fallbackTo,
              startedAt:
                transportResult.trace?.startedAt ?? startedAt.toISOString(),
              completedAt:
                transportResult.trace?.completedAt ?? completedAt.toISOString(),
              durationMs:
                transportResult.trace?.durationMs ??
                Math.max(0, completedAt.getTime() - startedAt.getTime()),
              timeoutMs: request.timeoutMs,
              warningCount: transportResult.warnings?.length ?? 0,
              errorCode: transportResult.error?.code,
              transportResult,
            }),
            [
              ...(precondition.warnings ?? []),
              ...(transportResult.warnings ?? []),
            ],
          );

    logInfo("tableau.metadata.execution.completed", {
      component: "tableau_metadata",
      operation,
      requestId: request.requestId,
      correlationId: request.correlationId,
      agentRunId: request.agentRunId,
      requestedTransportKind: selection.requestedTransportKind,
      selectedTransportKind: selection.selectedTransportKind,
      transportKind: transportResult.transportKind,
      transportStatus: transportResult.status,
      hostedFeatureEnabled: selection.hostedFeatureEnabled,
      fallbackUsed: selection.fallbackUsed,
      fallbackFrom: selection.fallbackFrom,
      fallbackTo: selection.fallbackTo,
      noNetworkRequested: selection.noNetworkRequested,
      durationMs:
        transportResult.trace?.durationMs ??
        Math.max(0, completedAt.getTime() - startedAt.getTime()),
      warningCount: transportResult.warnings?.length ?? 0,
      errorCode: transportResult.error?.code,
      retryCount: transportResult.trace?.attemptCount ?? 0,
      result:
        transportResult.status === "success" ||
        transportResult.status === "partial"
          ? selection.fallbackUsed
            ? "fallback"
            : "success"
          : "failure",
    });

    return normalizeTableauMetadataExecutionResult({
      toolName,
      request,
      precondition,
      transportResult,
      fallbackOutput: enrichedFallback,
      startedAt: transportResult.trace?.startedAt ?? startedAt.toISOString(),
      completedAt:
        transportResult.trace?.completedAt ?? completedAt.toISOString(),
    });
  } catch (error) {
    const completedAt = now();
    const transportResult: TableauMcpTransportResult = {
      requestId: request.requestId,
      transportKind: selection.selectedTransportKind,
      status: "failed",
      toolName,
      error: normalizeThrowableToTransportError(error),
      trace: {
        correlationId: request.correlationId,
        agentRunId: request.agentRunId,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
        transportKind: selection.selectedTransportKind,
        toolName,
      },
      timing: {
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
        timeoutMs: request.timeoutMs,
        timedOut: false,
      },
    };

    const fallback = withExecutionMetadata(
      failedBuilder(normalizedInput, precondition),
      buildExecutionMetadata({
        request,
        requestedTransportKind: selection.requestedTransportKind,
        selectedTransportKind: selection.selectedTransportKind,
        transportKind: selection.selectedTransportKind,
        transportStatus: transportResult.status,
        preconditionStatus: precondition.status,
        hostedFeatureEnabled: selection.hostedFeatureEnabled,
        noNetworkRequested: selection.noNetworkRequested,
        fallbackUsed: selection.fallbackUsed,
        fallbackFrom: selection.fallbackFrom,
        fallbackTo: selection.fallbackTo,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
        timeoutMs: request.timeoutMs,
        warningCount: 0,
        errorCode: transportResult.error?.code,
        transportResult,
      }),
    );

    logError("tableau.metadata.execution.failed", {
      component: "tableau_metadata",
      operation,
      requestId: request.requestId,
      correlationId: request.correlationId,
      agentRunId: request.agentRunId,
      requestedTransportKind: selection.requestedTransportKind,
      selectedTransportKind: selection.selectedTransportKind,
      transportKind: transportResult.transportKind,
      transportStatus: transportResult.status,
      hostedFeatureEnabled: selection.hostedFeatureEnabled,
      fallbackUsed: selection.fallbackUsed,
      fallbackFrom: selection.fallbackFrom,
      fallbackTo: selection.fallbackTo,
      noNetworkRequested: selection.noNetworkRequested,
      durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
      warningCount: 0,
      errorCode: transportResult.error?.code,
      retryCount: 0,
      result: "failure",
    });

    return normalizeTableauMetadataExecutionResult({
      toolName,
      request,
      precondition,
      transportResult,
      fallbackOutput: fallback,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
    });
  }
}

function buildTransportRequest<
  TInput extends TableauDescribeDatasourceInput | TableauListFieldsInput,
>(
  toolName: string,
  normalizedInput: TInput,
  executionInput: ToolExecutionInput,
  precondition: TableauMetadataPreconditionResult,
  selection: TableauMetadataTransportSelection,
): TableauMcpTransportRequest {
  const context = normalizeToolContext(executionInput);
  const contextualPrecondition =
    readContextualPreconditionInput(executionInput);
  const requestId =
    readString(context?.tableauMetadataRequestId) ??
    `tableau-metadata-${toolName}`;
  const correlationId =
    readString(context?.tableauMetadataCorrelationId) ??
    readString(executionInput.traceMetadata?.correlationId);
  const agentRunId =
    readString(context?.tableauMetadataAgentRunId) ?? executionInput.agentRunId;
  const hostedAuth = buildHostedTransportAuthContext({
    requestId,
    correlationId,
    agentRunId,
    contextualPrecondition,
  });
  const transportKind = selection.selectedTransportKind;
  const operation = getToolOperationName(toolName);

  logInfo("tableau.metadata.hosted_auth.context_prepared", {
    component: "tableau_metadata",
    operation,
    requestId,
    correlationId,
    agentRunId,
    authState: hostedAuth.traceSummary.authState,
    authMode: hostedAuth.traceSummary.authMode,
    siteSettingsStatus: hostedAuth.traceSummary.siteSettingsStatus,
    tokenReferencePresent: hostedAuth.traceSummary.tokenReferencePresent,
    tokenReferenceMasked: hostedAuth.traceSummary.tokenReferenceMasked,
    result:
      hostedAuth.traceSummary.authState === "ready" ? "success" : "failure",
    errorCode: hostedAuth.error?.code,
    fallbackUsed: false,
    retryCount: 0,
  });

  return {
    requestId,
    toolName,
    input: cloneMetadataJson(normalizedInput),
    timeoutMs:
      contextualPrecondition?.budget?.timeoutMs ??
      executionInput.timeoutMs ??
      5_000,
    correlationId,
    agentRunId,
    userContext: hostedAuth.transportUserContext,
    authContext: hostedAuth.transportAuthContext,
    trace: {
      correlationId,
      agentRunId,
      toolName,
      metadata: buildJsonObjectFromPairs([
        ["source", "tableau_metadata_execution_boundary"],
        ["transportKind", transportKind],
        ["hostedFeatureEnabled", selection.hostedFeatureEnabled],
        ["hostedTransportSelected", selection.hostedTransportSelected],
        ["noNetworkRequested", selection.noNetworkRequested],
        ["fallbackUsed", selection.fallbackUsed],
        ...(selection.fallbackFrom
          ? [["fallbackFrom", selection.fallbackFrom] as const]
          : []),
        ...(selection.fallbackTo
          ? [["fallbackTo", selection.fallbackTo] as const]
          : []),
        ["preconditionStatus", precondition.status],
        ["hostedAuthState", hostedAuth.traceSummary.authState],
        ["hostedAuthMode", hostedAuth.traceSummary.authMode],
        ...(hostedAuth.traceSummary.reasonCode
          ? [
              [
                "hostedAuthReasonCode",
                hostedAuth.traceSummary.reasonCode,
              ] as const,
            ]
          : []),
        [
          "hostedTokenReferenceMasked",
          hostedAuth.traceSummary.tokenReferenceMasked,
        ],
      ]),
    },
    metadata: buildJsonObjectFromPairs([
      ["source", "tableau_metadata_execution_boundary"],
      ["transportKind", transportKind],
      ["requestedTransportKind", selection.requestedTransportKind],
      ["preconditionStatus", precondition.status],
      ["selectedTransportKind", selection.selectedTransportKind],
      ["hostedFeatureEnabled", selection.hostedFeatureEnabled],
      ["hostedTransportSelected", selection.hostedTransportSelected],
      ["noNetworkRequested", selection.noNetworkRequested],
      ["fallbackUsed", selection.fallbackUsed],
      ...(selection.fallbackFrom
        ? [["fallbackFrom", selection.fallbackFrom] as const]
        : []),
      ...(selection.fallbackTo
        ? [["fallbackTo", selection.fallbackTo] as const]
        : []),
      [
        "noNetwork",
        contextualPrecondition?.transportConfig?.noNetwork === true ||
          selection.selectedTransportKind === "fake",
      ],
      ["hostedAuthState", hostedAuth.traceSummary.authState],
      ["hostedAuthMode", hostedAuth.traceSummary.authMode],
      ...(hostedAuth.traceSummary.reasonCode
        ? [
            [
              "hostedAuthReasonCode",
              hostedAuth.traceSummary.reasonCode,
            ] as const,
          ]
        : []),
      [
        "hostedTokenReferenceMasked",
        hostedAuth.traceSummary.tokenReferenceMasked,
      ],
    ]),
  };
}

function buildExecutionMetadata(args: {
  request: TableauMcpTransportRequest;
  requestedTransportKind?: TableauMcpTransportKind;
  selectedTransportKind?: TableauMcpTransportKind;
  transportKind: TableauMcpTransportKind;
  transportStatus: TableauMcpTransportStatus;
  preconditionStatus: TableauMetadataPreconditionResult["status"];
  hostedFeatureEnabled?: boolean;
  fallbackUsed?: boolean;
  noNetworkRequested?: boolean;
  fallbackFrom?: TableauMcpTransportKind;
  fallbackTo?: TableauMcpTransportKind;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  warningCount: number;
  errorCode?: string;
  timeoutMs?: number;
  transportResult?: TableauMcpTransportResult;
}): JsonObject {
  return buildJsonObjectFromPairs([
    [
      "source",
      args.transportKind === "fake" ? "fake_no_network" : "transport_boundary",
    ],
    ["placeholder", args.transportKind === "fake"],
    ["requestId", args.request.requestId],
    ["toolName", args.request.toolName],
    ["correlationId", args.request.correlationId],
    ["agentRunId", args.request.agentRunId],
    ["requestedTransportKind", args.requestedTransportKind],
    ["selectedTransportKind", args.selectedTransportKind],
    ["transportKind", args.transportKind],
    ["transportStatus", args.transportStatus],
    ["preconditionStatus", args.preconditionStatus],
    ["hostedFeatureEnabled", args.hostedFeatureEnabled],
    ["noNetworkRequested", args.noNetworkRequested],
    ["fallbackUsed", args.fallbackUsed],
    ...(args.fallbackFrom
      ? [["fallbackFrom", args.fallbackFrom] as const]
      : []),
    ...(args.fallbackTo ? [["fallbackTo", args.fallbackTo] as const] : []),
    ["startedAt", args.startedAt],
    ["completedAt", args.completedAt],
    ["durationMs", args.durationMs],
    ["timeoutMs", args.timeoutMs],
    ["warningCount", args.warningCount],
    ["errorCode", args.errorCode],
    ["transportEventId", args.transportResult?.trace?.transportEventId],
    ["remoteTraceId", args.transportResult?.trace?.remoteTraceId],
    ["hostedSessionId", args.transportResult?.trace?.hostedSessionId],
  ]);
}

function mergeExecutionMetadata(
  base: JsonObject | undefined,
  addition: JsonObject,
): JsonObject {
  return buildJsonObjectFromPairs([
    ...(base
      ? (Object.entries(base).map(
          (entry) => entry as readonly [string, JsonValue],
        ) as readonly (readonly [string, JsonValue])[])
      : []),
    ...Object.entries(addition).map(
      (entry) => entry as readonly [string, JsonValue],
    ),
  ]);
}

function withExecutionMetadata<
  TOutput extends TableauDescribeDatasourceOutput | TableauListFieldsOutput,
>(
  output: TOutput,
  metadata: JsonObject,
  warnings: readonly {
    code?: string;
    message: string;
    target?: string;
    metadata?: JsonObject;
  }[] = [],
): TOutput {
  const cloned = output as TOutput;
  const mergedWarnings = dedupeWarnings([
    ...(Array.isArray(cloned.warnings) ? cloned.warnings : []),
    ...warnings.map((warning) => ({
      code: normalizeWarningCode(warning.code ?? "UNKNOWN_WARNING"),
      message: warning.message,
      target: warning.target,
      metadata: warning.metadata
        ? cloneMetadataJson(warning.metadata)
        : undefined,
    })),
  ]);

  if (mergedWarnings.length > 0) {
    cloned.warnings = mergedWarnings;
  }

  cloned.metadata = mergeExecutionMetadata(cloned.metadata, metadata);
  return cloned;
}

function dedupeWarnings(
  warnings: readonly TableauMetadataWarningSummary[],
): TableauMetadataWarningSummary[] {
  const seen = new Set<string>();
  const deduped: TableauMetadataWarningSummary[] = [];

  for (const warning of warnings) {
    const key = `${warning.code}:${warning.message}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push({
      code: warning.code,
      message: warning.message,
      ...(warning.target ? { target: warning.target } : {}),
      ...(warning.metadata
        ? { metadata: cloneMetadataJson(warning.metadata) }
        : {}),
    });
  }

  return deduped;
}

function buildHostedTransportAuthContext(input: {
  requestId: string;
  correlationId?: string;
  agentRunId?: string;
  contextualPrecondition?: Partial<TableauMetadataPreconditionInput>;
}): HostedMcpAuthContextAdapterResult {
  return createHostedMcpAuthContextAdapter({
    requestId: input.requestId,
    correlationId: input.correlationId,
    agentRunId: input.agentRunId,
    authenticatedUser: input.contextualPrecondition?.authenticatedTableauContext
      ?.userId
      ? {
          userId:
            input.contextualPrecondition.authenticatedTableauContext.userId,
          email: input.contextualPrecondition.authenticatedTableauContext.email,
          tableauSubject:
            input.contextualPrecondition.authenticatedTableauContext
              .tableauUserId,
        }
      : undefined,
    authenticatedTableauContext:
      input.contextualPrecondition?.authenticatedTableauContext,
    siteSettings: input.contextualPrecondition?.siteSettings,
    metadata: buildJsonObjectFromPairs([
      ["source", "tableau_metadata_execution_boundary"],
      ["requestId", input.requestId],
      ...(input.correlationId
        ? [["correlationId", input.correlationId] as const]
        : []),
      ...(input.agentRunId ? [["agentRunId", input.agentRunId] as const] : []),
      [
        "authContextSource",
        input.contextualPrecondition?.authenticatedTableauContext
          ? "contextual_precondition"
          : "default_fake_context",
      ],
    ]),
  });
}

function buildTransportSelection(
  toolName: string,
  executionInput: ToolExecutionInput,
  options: {
    fallbackTransport: TableauMcpTransport;
    hostedTransport?: TableauMcpTransport;
  },
): TableauMetadataTransportSelection {
  const context = normalizeToolContext(executionInput);
  const contextualPrecondition =
    readContextualPreconditionInput(executionInput);
  const requestedTransportKind = getRequestedTransportKind(executionInput);
  const noNetworkRequested =
    contextualPrecondition?.transportConfig?.noNetwork === true ||
    readBoolean(context?.tableauMetadataNoNetwork);
  const hostedFeatureEnabled = readBoolean(
    context?.tableauMetadataHostedExecutionEnabled,
  )
    ? true
    : readBoolean(
          (contextualPrecondition as JsonObject | undefined)
            ?.tableauMetadataHostedExecutionEnabled,
        )
      ? true
      : readBoolean(
          contextualPrecondition?.metadata
            ?.tableauMetadataHostedExecutionEnabled,
        );
  const hostedRequested =
    requestedTransportKind === "hosted" &&
    toolName === TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME;
  const hostedTransportSelected =
    hostedFeatureEnabled &&
    hostedRequested &&
    !noNetworkRequested &&
    options.hostedTransport !== undefined;
  const selectedTransportKind = hostedTransportSelected
    ? "hosted"
    : options.fallbackTransport.kind;
  const fallbackUsed =
    requestedTransportKind === "hosted" && !hostedTransportSelected;

  return {
    requestedTransportKind,
    selectedTransportKind,
    hostedFeatureEnabled,
    hostedTransportSelected,
    noNetworkRequested,
    fallbackUsed,
    ...(fallbackUsed ? { fallbackFrom: "hosted" as const } : {}),
    ...(fallbackUsed ? { fallbackTo: options.fallbackTransport.kind } : {}),
  };
}

function getRequestedTransportKind(
  executionInput: ToolExecutionInput,
): TableauMcpTransportKind {
  const contextualPrecondition =
    readContextualPreconditionInput(executionInput);
  return (
    readTransportKind(
      contextualPrecondition?.transportConfig?.selectedTransportKind,
    ) ??
    readTransportKind(
      normalizeToolContext(executionInput)?.tableauMetadataTransportKind,
    ) ??
    "unknown"
  );
}

function getToolOperationName(toolName: string): string {
  if (toolName === TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME) {
    return "describeDatasource";
  }

  if (toolName === TABLEAU_METADATA_LIST_FIELDS_TOOL_NAME) {
    return "listFields";
  }

  return toolName;
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function normalizeThrowableToTransportError(
  error: unknown,
): TableauMcpTransportError {
  if (error instanceof Error) {
    return {
      code: "UNKNOWN_ERROR",
      message: error.message,
      retryable: false,
      userActionRequired: true,
      source: error.name,
    };
  }

  return {
    code: "UNKNOWN_ERROR",
    message: "The Tableau metadata transport failed unexpectedly.",
    retryable: false,
    userActionRequired: true,
  };
}

function normalizeToolContext(
  input: ToolExecutionInput,
): JsonObject | undefined {
  return isJsonObject(input.context) ? input.context : undefined;
}

function readContextualPreconditionInput(
  input: ToolExecutionInput,
): Partial<TableauMetadataPreconditionInput> | undefined {
  const context = normalizeToolContext(input);
  if (!isJsonObject(context?.tableauMetadataPreconditionInput)) {
    return undefined;
  }

  return context.tableauMetadataPreconditionInput as Partial<TableauMetadataPreconditionInput>;
}

function nowIso(now?: () => Date): string {
  return (now ?? (() => new Date()))().toISOString();
}

function createFakeTransportPreconditionResult(
  request: TableauMcpTransportRequest,
  datasourceResolution: "resolved" | "missing" | "ambiguous" | "not_found",
): TableauMetadataPreconditionResult {
  return {
    status: "passed",
    canExecute: true,
    warnings: [
      {
        code: "USING_FAKE_TRANSPORT",
        message: "Fake no-network metadata result.",
        metadata: buildJsonObjectFromPairs([
          ["transportKind", "fake"],
          ["noNetwork", true],
          ["source", "fake_no_network"],
          ["placeholder", true],
        ]),
      },
    ],
    governance: {
      readOnly: "allowed",
      safeForPreview: "allowed",
      externalAccess: "allowed",
      underlyingDataAccess: "not_requested",
      writeOperation: "not_requested",
      allowedToolPolicy: "allowed",
      permission: "not_verified",
      siteSettings: "enabled",
    },
    metadata: buildJsonObjectFromPairs([
      ["datasourceResolution", datasourceResolution],
      [
        "transportKind",
        request.metadata?.selectedTransportKind ??
          request.metadata?.requestedTransportKind ??
          "fake",
      ],
      ["fakeNoNetwork", true],
    ]),
  };
}

function buildTransportTraceMetadata(
  request: TableauMcpTransportRequest,
  startedAt: string,
  completedAt: string,
  durationMs: number,
  stdioProcessIdAvailable: boolean,
): TableauMcpTransportTraceMetadata {
  return {
    correlationId: request.correlationId,
    agentRunId: request.agentRunId,
    startedAt,
    completedAt,
    durationMs,
    transportKind: (request.metadata?.selectedTransportKind ??
      request.metadata?.requestedTransportKind) as
      | TableauMcpTransportKind
      | undefined,
    toolName: request.toolName,
    attemptCount: 1,
    stdioProcessIdAvailable,
    metadata: buildJsonObjectFromPairs([
      ["source", "tableau_metadata_execution_boundary"],
      ["requestId", request.requestId],
    ]),
  };
}

function buildPreconditionInput(
  input: ToolExecutionInput,
  toolName: string,
  normalizedInput: TableauDescribeDatasourceInput | TableauListFieldsInput,
  selection: TableauMetadataTransportSelection,
): TableauMetadataPreconditionInput {
  const context = isJsonObject(input.context) ? input.context : undefined;
  const contextualPrecondition = isJsonObject(
    context?.tableauMetadataPreconditionInput,
  )
    ? (context.tableauMetadataPreconditionInput as Partial<TableauMetadataPreconditionInput>)
    : undefined;
  const useFakeDefaults = selection.selectedTransportKind === "fake";

  return {
    toolName,
    requestId: readString(context?.tableauMetadataRequestId),
    correlationId: readString(context?.tableauMetadataCorrelationId),
    agentRunId:
      readString(context?.tableauMetadataAgentRunId) ?? input.agentRunId,
    authenticatedTableauContext:
      contextualPrecondition?.authenticatedTableauContext ?? {
        isAuthenticated: useFakeDefaults,
        authMode: useFakeDefaults ? "fake" : "unknown",
        ...(useFakeDefaults
          ? buildJsonObjectFromPairs([
              ["userId", readString(context?.tableauMetadataUserId)],
              [
                "tableauUserId",
                readString(context?.tableauMetadataTableauUserId),
              ],
              ["email", readString(context?.tableauMetadataEmail)],
              ["siteId", readString(context?.tableauMetadataSiteId)],
              ["siteName", readString(context?.tableauMetadataSiteName)],
            ])
          : {}),
      },
    siteSettings:
      contextualPrecondition?.siteSettings ??
      (useFakeDefaults
        ? ({
            status: "not_required_for_fake",
            source: "fake",
          } as const)
        : ({
            status: "unknown",
            source: "unknown",
          } as const)),
    identifierResolution: contextualPrecondition?.identifierResolution ?? {
      datasource:
        readResolutionOverride(context?.tableauMetadataDatasourceResolution) ??
        buildDatasourceResolution(normalizedInput),
      workbook: readResolutionOverride(
        context?.tableauMetadataWorkbookResolution,
      ),
      view: readResolutionOverride(context?.tableauMetadataViewResolution),
      site: readResolutionOverride(context?.tableauMetadataSiteResolution),
    },
    toolPolicy: {
      ...FAKE_HANDLER_TOOL_POLICY,
      ...(contextualPrecondition?.toolPolicy ?? {}),
    },
    budget: {
      timeoutMs: 5_000,
      remainingTimeMs: 5_000,
      maxItems: 25,
      ...(contextualPrecondition?.budget ?? {}),
    },
    transportConfig: {
      ...(contextualPrecondition?.transportConfig ?? {}),
      selectedTransportKind: selection.selectedTransportKind,
      status: contextualPrecondition?.transportConfig?.status ?? "selected",
      noNetwork:
        selection.noNetworkRequested ||
        selection.selectedTransportKind === "fake",
    },
    permission:
      contextualPrecondition?.permission ??
      ({
        status: "not_verified",
      } as const),
    metadata: buildJsonObjectFromPairs([
      ["source", "fake_no_network"],
      ["placeholder", true],
      ["toolName", toolName],
      ...(input.agentRunId ? [["agentRunId", input.agentRunId] as const] : []),
    ]),
  };
}

function normalizeDescribeDatasourceInput(
  value: unknown,
  context: JsonObject | undefined,
): TableauDescribeDatasourceInput {
  const input = normalizeMetadataToolInput(value);
  const requestContext = readRequestContext(context);

  return {
    requestContext: requestContext ?? createDefaultRequestContext(),
    datasource: normalizeDatasourceIdentifier(input.datasource),
    workbook: normalizeWorkbookIdentifier(input.workbook),
    view: normalizeViewIdentifier(input.view),
    site: normalizeSiteIdentifier(input.site),
    includeFieldsSummary:
      typeof input.includeFieldsSummary === "boolean"
        ? input.includeFieldsSummary
        : true,
    includeConnectionSummary:
      typeof input.includeConnectionSummary === "boolean"
        ? input.includeConnectionSummary
        : true,
    maxFieldsForSummary: normalizeMaxItems(
      readNumber(input.maxFieldsForSummary),
    ),
  };
}

function normalizeListFieldsInput(
  value: unknown,
  context: JsonObject | undefined,
): TableauListFieldsInput {
  const input = normalizeMetadataToolInput(value);
  const requestContext = readRequestContext(context);

  return {
    requestContext: requestContext ?? createDefaultRequestContext(),
    datasource: normalizeDatasourceIdentifier(input.datasource),
    workbook: normalizeWorkbookIdentifier(input.workbook),
    view: normalizeViewIdentifier(input.view),
    site: normalizeSiteIdentifier(input.site),
    maxFields: normalizeMaxItems(readNumber(input.maxFields)),
    includeHidden: Boolean(input.includeHidden),
    includeTechnicalMetadata: Boolean(input.includeTechnicalMetadata),
    ...(typeof input.fieldNameFilter === "string"
      ? { fieldNameFilter: input.fieldNameFilter }
      : {}),
  };
}

function buildDescribeDatasourceSuccessOutput(
  input: TableauDescribeDatasourceInput,
  precondition: TableauMetadataPreconditionResult,
): TableauDescribeDatasourceOutput {
  const visibleFields = getVisibleFields();
  const hiddenFields = getHiddenFields();
  const allFields = [...visibleFields, ...hiddenFields];
  const maxFields =
    normalizeMaxItems(input.maxFieldsForSummary) ?? allFields.length;
  const sampleFields = allFields.slice(0, maxFields);
  const fieldCount = allFields.length;

  return {
    status: "success",
    summary: buildDatasourceSummary(
      input,
      fieldCount,
      visibleFields.length,
      hiddenFields.length,
    ),
    resolution: preconditionToResolution(precondition),
    ...(input.includeFieldsSummary === false
      ? {}
      : {
          fieldsSummary: {
            totalFields: fieldCount,
            visibleFields: visibleFields.length,
            hiddenFields: hiddenFields.length,
            returnedSampleCount: sampleFields.length,
            sampleFieldNames: sampleFields.map((field) => field.fieldName),
            truncated: sampleFields.length < fieldCount,
          },
        }),
    ...(input.includeConnectionSummary === false
      ? {}
      : {
          connectionSummary: {
            connectionType: FAKE_DATASET.connectionType,
            isExtract: FAKE_DATASET.isExtract,
            liveOrExtract: "unknown" as const,
          },
        }),
    warnings: buildOutputWarnings(precondition),
    metadata: buildPlaceholderMetadata("success"),
  };
}

function buildListFieldsSuccessOutput(
  input: TableauListFieldsInput,
  precondition: TableauMetadataPreconditionResult,
): TableauListFieldsOutput {
  const baseFields =
    input.includeHidden === true
      ? [...FAKE_DATASET.fields]
      : getVisibleFields();
  const filteredFields = applyFieldNameFilter(
    baseFields,
    input.fieldNameFilter,
  );
  const maxFields = normalizeMaxItems(input.maxFields) ?? filteredFields.length;
  const returnedFields = filteredFields.slice(0, maxFields);
  const hiddenFieldCount = FAKE_DATASET.fields.filter(
    (field) => field.isHidden,
  ).length;
  const visibleFieldCount = FAKE_DATASET.fields.filter(
    (field) => !field.isHidden,
  ).length;
  const omissions: TableauMetadataOmissionSummary[] = [];

  if (input.includeHidden !== true && hiddenFieldCount > 0) {
    omissions.push({
      omitted: true,
      reason: "hidden_by_default",
      message: "Hidden fields were omitted from the fake result.",
      count: hiddenFieldCount,
    });
  }

  if (returnedFields.length < filteredFields.length) {
    omissions.push({
      omitted: true,
      reason: "field_limit",
      message: "The fake field list was truncated to respect maxFields.",
      count: filteredFields.length - returnedFields.length,
    });
  }

  return {
    status: "success",
    datasource: buildDatasourceSummary(
      input,
      baseFields.length,
      visibleFieldCount,
      hiddenFieldCount,
    ),
    resolution: preconditionToResolution(precondition),
    fields: returnedFields,
    fieldCountSummary: {
      returned: returnedFields.length,
      totalAvailable: filteredFields.length,
      visibleFields: visibleFieldCount,
      hiddenFields: hiddenFieldCount,
    },
    warnings: buildOutputWarnings(
      precondition,
      returnedFields.length < filteredFields.length,
    ),
    ...(omissions.length > 0 ? { omissions } : {}),
    ...(returnedFields.length < filteredFields.length
      ? {
          truncation: {
            truncated: true,
            limit: maxFields,
            returned: returnedFields.length,
            totalAvailable: filteredFields.length,
            reason: "field_limit",
          } satisfies TableauMetadataTruncationSummary,
        }
      : {}),
    metadata: buildPlaceholderMetadata("success"),
  };
}

function buildDescribeDatasourceFailedOutput(
  input: TableauDescribeDatasourceInput,
  precondition: TableauMetadataPreconditionResult,
): TableauDescribeDatasourceOutput {
  return {
    status: "failed",
    summary: buildDatasourceSummary(input, 0, 0, 0, true),
    resolution: preconditionToResolution(precondition),
    error: buildOutputError(precondition),
    warnings: buildOutputWarnings(precondition),
    metadata: buildPlaceholderMetadata("failed"),
  };
}

function buildListFieldsFailedOutput(
  input: TableauListFieldsInput,
  precondition: TableauMetadataPreconditionResult,
): TableauListFieldsOutput {
  return {
    status: "failed",
    datasource: buildDatasourceSummary(input, 0, 0, 0, true),
    resolution: preconditionToResolution(precondition),
    fields: [],
    fieldCountSummary: {
      returned: 0,
      totalAvailable: 0,
      visibleFields: 0,
      hiddenFields: 0,
    },
    error: buildOutputError(precondition),
    warnings: buildOutputWarnings(precondition),
    metadata: buildPlaceholderMetadata("failed"),
  };
}

function buildOutputWarnings(
  precondition: TableauMetadataPreconditionResult,
  truncated = false,
): readonly TableauMetadataWarningSummary[] {
  const warnings: TableauMetadataWarningSummary[] = [
    cloneMetadataJson(FAKE_TRANSPORT_WARNING),
  ];

  if (truncated) {
    warnings.push({
      code: "OUTPUT_TRUNCATED",
      message: "The fake result was truncated to respect the configured limit.",
      metadata: buildJsonObjectFromPairs([
        ["source", "fake_no_network"],
        ["placeholder", true],
      ]),
    });
  }

  if (precondition.status === "warning" && precondition.warnings?.length) {
    for (const warning of precondition.warnings) {
      warnings.push({
        code: normalizeWarningCode(warning.code),
        message: warning.message,
        target: warning.target,
        metadata: warning.metadata
          ? cloneMetadataJson(warning.metadata)
          : undefined,
      });
    }
  }

  return warnings;
}

function buildOutputError(
  precondition: TableauMetadataPreconditionResult,
): TableauMetadataErrorSummary {
  const code = mapPreconditionFailureToErrorCode(precondition.failureCode);
  return {
    code,
    message:
      precondition.userFacingMessage ??
      precondition.message ??
      "Metadata precondition failed.",
    retryable: code === "TIMEOUT" || code === "TRANSPORT_NOT_CONFIGURED",
    userActionRequired:
      code !== "TIMEOUT" && code !== "TRANSPORT_NOT_CONFIGURED",
    metadata: buildJsonObjectFromPairs([
      ["source", "fake_no_network"],
      ["preconditionStatus", precondition.status],
      [
        "failureCode",
        precondition.failureCode ?? "UNKNOWN_PRECONDITION_FAILURE",
      ],
    ]),
  };
}

function mapPreconditionFailureToErrorCode(
  failureCode: TableauMetadataPreconditionResult["failureCode"],
): TableauMetadataErrorCode {
  switch (failureCode) {
    case "AUTH_REQUIRED":
      return "AUTH_REQUIRED";
    case "DATASOURCE_IDENTIFIER_MISSING":
      return "MISSING_REQUIRED_IDENTIFIER";
    case "DATASOURCE_IDENTIFIER_AMBIGUOUS":
    case "WORKBOOK_IDENTIFIER_AMBIGUOUS":
    case "VIEW_IDENTIFIER_AMBIGUOUS":
      return "AMBIGUOUS_IDENTIFIER";
    case "SITE_SETTINGS_DISABLED":
      return "SITE_SETTINGS_DISABLED";
    case "TRANSPORT_NOT_CONFIGURED":
      return "TRANSPORT_NOT_CONFIGURED";
    case "BUDGET_EXHAUSTED":
    case "TIMEOUT_TOO_LOW":
      return "TIMEOUT";
    case "PERMISSION_DENIED":
      return "PERMISSION_DENIED";
    case "INSUFFICIENT_SCOPE":
      return "PERMISSION_DENIED";
    default:
      return "UNKNOWN_ERROR";
  }
}

function preconditionToResolution(
  precondition: TableauMetadataPreconditionResult,
): TableauMetadataResolutionSummary {
  const datasourceResolution =
    precondition.metadata?.datasourceResolution ?? "not_checked";

  if (datasourceResolution === "resolved") {
    return {
      status: "resolved",
      target: "datasource",
      selectedId: FAKE_DATASET.datasourceId,
      selectedName: FAKE_DATASET.datasourceName,
      message: "Datasource resolved in fake mode.",
    };
  }

  if (datasourceResolution === "ambiguous") {
    return {
      status: "ambiguous",
      target: "datasource",
      candidates: [
        {
          id: "fake-candidate-1",
          name: "Fake Candidate One",
          type: "datasource",
          confidence: "medium",
        },
        {
          id: "fake-candidate-2",
          name: "Fake Candidate Two",
          type: "datasource",
          confidence: "low",
        },
      ],
      message: "Datasource resolution is ambiguous in fake mode.",
    };
  }

  if (datasourceResolution === "missing") {
    return {
      status: "missing",
      target: "datasource",
      message: "Datasource identifier is missing.",
    };
  }

  if (datasourceResolution === "not_found") {
    return {
      status: "not_found",
      target: "datasource",
      message: "Datasource was not found in fake mode.",
    };
  }

  return {
    status: "not_checked",
    target: "datasource",
    message: "Datasource resolution was not checked.",
  };
}

function buildDatasourceSummary(
  input: TableauDescribeDatasourceInput | TableauListFieldsInput,
  fieldCount: number,
  visibleFieldCount: number,
  hiddenFieldCount: number,
  placeholder = false,
): NonNullable<TableauDescribeDatasourceOutput["summary"]> {
  return {
    datasourceId:
      input.datasource.datasourceId ??
      DEFAULT_DATASOURCE_IDENTIFIER.datasourceId,
    datasourceName:
      input.datasource.datasourceName ??
      DEFAULT_DATASOURCE_IDENTIFIER.datasourceName,
    ...(input.datasource.projectId
      ? { projectId: input.datasource.projectId }
      : { projectId: DEFAULT_DATASOURCE_IDENTIFIER.projectId }),
    ...(input.datasource.projectName
      ? { projectName: input.datasource.projectName }
      : { projectName: DEFAULT_DATASOURCE_IDENTIFIER.projectName }),
    ...(input.workbook?.workbookId
      ? { workbookId: input.workbook.workbookId }
      : {}),
    ...(input.workbook?.workbookName
      ? { workbookName: input.workbook.workbookName }
      : {}),
    siteId: input.site?.siteId ?? DEFAULT_SITE_IDENTIFIER.siteId,
    siteName: input.site?.siteName ?? DEFAULT_SITE_IDENTIFIER.siteName,
    ownerName: FAKE_DATASET.ownerName,
    connectionType: FAKE_DATASET.connectionType,
    isExtract: FAKE_DATASET.isExtract,
    fieldCount,
    visibleFieldCount,
    hiddenFieldCount,
    ...(placeholder
      ? {
          metadata: buildJsonObjectFromPairs([
            ["source", "fake_no_network"],
            ["placeholder", true],
          ]),
        }
      : {}),
  };
}

function getVisibleFields(): TableauFieldSummary[] {
  return FAKE_DATASET.fields.filter((field) => !field.isHidden);
}

function getHiddenFields(): TableauFieldSummary[] {
  return FAKE_DATASET.fields.filter((field) => field.isHidden);
}

function applyFieldNameFilter(
  fields: TableauFieldSummary[],
  filter: string | undefined,
): TableauFieldSummary[] {
  if (!filter) {
    return fields;
  }

  const lowerFilter = filter.toLowerCase();
  return fields.filter((field) =>
    field.fieldName.toLowerCase().includes(lowerFilter),
  );
}

function buildPlaceholderMetadata(status: "success" | "failed"): JsonObject {
  return buildJsonObjectFromPairs([
    ["source", "fake_no_network"],
    ["placeholder", true],
    ["status", status],
  ]);
}

function buildJsonObjectFromPairs(
  entries: readonly (readonly [string, JsonValue | undefined])[],
): JsonObject {
  const result: JsonObject = {};
  for (const [key, value] of entries) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

function createDefaultRequestContext(): TableauDescribeDatasourceInput["requestContext"] {
  return {
    requestId: "fake-request-id",
    correlationId: "fake-correlation-id",
    agentRunId: "fake-agent-run-id",
    locale: "en-US",
    maxItems: 25,
    includeHidden: false,
    includeTechnicalMetadata: false,
    metadata: buildJsonObjectFromPairs([
      ["source", "fake_no_network"],
      ["placeholder", true],
    ]),
  };
}

function readRequestContext(
  context: JsonObject | undefined,
): TableauDescribeDatasourceInput["requestContext"] | undefined {
  if (!isJsonObject(context?.tableauMetadataRequestContext)) {
    return undefined;
  }

  return cloneMetadataJson(
    context.tableauMetadataRequestContext,
  ) as TableauDescribeDatasourceInput["requestContext"];
}

function readResolutionOverride(
  value: unknown,
): TableauMetadataResolutionSummary | undefined {
  if (!isJsonObject(value)) {
    return undefined;
  }

  return cloneMetadataJson(
    value,
  ) as unknown as TableauMetadataResolutionSummary;
}

function buildDatasourceResolution(
  input: TableauDescribeDatasourceInput | TableauListFieldsInput,
): TableauMetadataResolutionSummary {
  const datasourceId = input.datasource.datasourceId;
  const datasourceName = input.datasource.datasourceName;

  if (datasourceId || datasourceName) {
    return {
      status: "resolved",
      target: "datasource",
      selectedId: datasourceId ?? FAKE_DATASET.datasourceId,
      selectedName: datasourceName ?? FAKE_DATASET.datasourceName,
      message: "Datasource resolved in fake mode.",
    };
  }

  return {
    status: "missing",
    target: "datasource",
    message: "Datasource identifier is missing.",
  };
}

function normalizeMetadataToolInput(value: unknown): Record<string, unknown> {
  return isJsonObject(value) ? value : {};
}

function normalizeDatasourceIdentifier(
  value: unknown,
): TableauDescribeDatasourceInput["datasource"] {
  if (isJsonObject(value)) {
    return cloneMetadataJson(value);
  }

  return {};
}

function normalizeWorkbookIdentifier(
  value: unknown,
): TableauDescribeDatasourceInput["workbook"] | undefined {
  if (!isJsonObject(value)) {
    return undefined;
  }

  return cloneMetadataJson(value) as TableauDescribeDatasourceInput["workbook"];
}

function normalizeViewIdentifier(
  value: unknown,
): TableauDescribeDatasourceInput["view"] | undefined {
  if (!isJsonObject(value)) {
    return undefined;
  }

  return cloneMetadataJson(value) as TableauDescribeDatasourceInput["view"];
}

function normalizeSiteIdentifier(
  value: unknown,
): TableauDescribeDatasourceInput["site"] | undefined {
  if (!isJsonObject(value)) {
    return undefined;
  }

  return cloneMetadataJson(value) as TableauDescribeDatasourceInput["site"];
}

function normalizeWarningCode(
  code: TableauMetadataWarningSummary["code"] | string,
): TableauMetadataWarningSummary["code"] {
  switch (code) {
    case "PERMISSION_NOT_VERIFIED":
    case "SITE_SETTINGS_NOT_VERIFIED":
    case "TRANSPORT_WARNING":
    case "FIELD_LIST_TRUNCATED":
    case "OUTPUT_TRUNCATED":
    case "AMBIGUOUS_DATASOURCE":
    case "MISSING_DATASOURCE_IDENTIFIER":
    case "TECHNICAL_METADATA_OMITTED":
    case "HIDDEN_FIELDS_OMITTED":
      return code;
    case "USING_FAKE_TRANSPORT":
    case "USING_STDIO_FALLBACK":
      return "TRANSPORT_WARNING";
    case "MAX_ITEMS_REDUCED":
      return "OUTPUT_TRUNCATED";
    default:
      return "UNKNOWN_WARNING";
  }
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function readTransportKind(
  value: unknown,
): TableauMetadataTransportKind | undefined {
  if (
    value === "stdio" ||
    value === "hosted" ||
    value === "remote" ||
    value === "fake" ||
    value === "unknown"
  ) {
    return value;
  }

  return undefined;
}
