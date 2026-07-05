import {
  createFallbackIntentResolution,
  createResolvedIntentResolution,
  createUnresolvedIntentResolution,
  type IntentResolutionInput,
  type IntentResolutionResult,
} from "./intent";
import {
  buildMetadataDiscoveryIntentTraceMetadata,
  classifyMetadataDiscoveryIntent,
  type MetadataDiscoveryIntentDecision,
  type MetadataDiscoveryTargetContext,
} from "./metadataDiscoveryIntent";
import {
  buildMetadataDiscoveryPlan,
  buildMetadataDiscoveryPlanTraceMetadata,
  type MetadataDiscoveryPlan,
} from "./metadataDiscoveryPlan";
import {
  createTableauMetadataToolRuntime,
  type TableauMetadataExecutionBoundaryOptions,
  type TableauMcpTransportKind,
} from "./tableauMetadataToolRuntime";
import { TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME } from "./tableauMetadataTools";
import type { TableauDescribeDatasourceInput } from "./tableauMetadataSchemas";
import type { TableauMetadataPreconditionInput } from "./tableauMetadataPreconditions";
import type { JsonObject, JsonValue } from "./types";
import type { TableauMetadataNormalizedResult } from "./tableauMetadataOutputNormalization";
import type { AuthenticatedUser } from "../types/auth";

export type MetadataDiscoveryOrchestrationStatus =
  | "completed"
  | "clarification_required"
  | "unsupported"
  | "fallback"
  | "failed";

export type MetadataDiscoveryOrchestrationExecutionContext = {
  authenticatedUser?: AuthenticatedUser;
  tableauMetadataTransportKind?: TableauMcpTransportKind;
  tableauMetadataHostedExecutionEnabled?: boolean;
  tableauMetadataNoNetwork?: boolean;
  tableauMetadataRequestContext?: JsonObject;
  tableauMetadataPreconditionInput?: Partial<TableauMetadataPreconditionInput>;
};

export type MetadataDiscoveryOrchestrationInput = {
  intentResolutionInput: IntentResolutionInput;
  executionContext?: MetadataDiscoveryOrchestrationExecutionContext;
  executionBoundary?: TableauMetadataExecutionBoundaryOptions;
};

export type MetadataDiscoveryOrchestrationExecutionResult = {
  toolName: string;
  status: TableauMetadataNormalizedResult["status"];
  normalizedOutput: TableauMetadataNormalizedResult;
  traceMetadata?: JsonObject;
};

export type MetadataDiscoveryOrchestrationResponse = {
  mode: "resolve_and_execute_metadata_discovery";
  status: MetadataDiscoveryOrchestrationStatus;
  message: string;
  placeholderResponse: string;
  intentResolution: IntentResolutionResult;
  decision: MetadataDiscoveryIntentDecision;
  plan: MetadataDiscoveryPlan;
  execution?: MetadataDiscoveryOrchestrationExecutionResult;
  responseMaterial?: JsonObject;
  traceMetadata?: JsonObject;
};

export async function runMetadataDiscoveryOrchestration(
  input: MetadataDiscoveryOrchestrationInput,
): Promise<MetadataDiscoveryOrchestrationResponse> {
  const decision = classifyMetadataDiscoveryIntent({
    agentRunId: input.intentResolutionInput.agentRunId,
    message: input.intentResolutionInput.message,
    contextSummary: input.intentResolutionInput.contextSummary,
    targetContext: normalizeTargetContext(
      input.intentResolutionInput.targetContext,
    ),
    metadata: input.intentResolutionInput.metadata,
  });
  const intentResolution = buildIntentResolution(decision);
  const plan = buildMetadataDiscoveryPlan({
    decision,
    targetContext: normalizeTargetContext(
      input.intentResolutionInput.targetContext,
    ),
  });
  const traceMetadata = buildMetadataDiscoveryOrchestrationTraceMetadata({
    decision,
    plan,
  });

  if (plan.planState !== "executable" || !plan.executionCandidate) {
    return {
      mode: "resolve_and_execute_metadata_discovery",
      status: mapPlanStateToOrchestrationStatus(plan.planState),
      message: plan.safeMessage,
      placeholderResponse: plan.safeMessage,
      intentResolution,
      decision,
      plan,
      traceMetadata,
    };
  }

  const runtime = createTableauMetadataToolRuntime(input.executionBoundary);
  const execution = await runtime.executionWrapper.execute({
    toolName: TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME,
    input: buildDescribeDatasourceExecutionInput(plan, input),
    context: buildMetadataDiscoveryExecutionContext(input, plan),
    traceMetadata: {
      metadataDiscoveryPlan: buildMetadataDiscoveryPlanTraceMetadata(plan),
      metadataDiscoveryDecision:
        buildMetadataDiscoveryIntentTraceMetadata(decision),
    },
  });

  const normalizedOutput = toTableauMetadataNormalizedResult(
    execution.normalizedOutput ?? execution.output,
  );
  const executionStatus = normalizedOutput.status;
  const completedStatus =
    executionStatus === "success" || executionStatus === "partial"
      ? "completed"
      : "failed";

  return {
    mode: "resolve_and_execute_metadata_discovery",
    status: completedStatus,
    message: buildExecutionMessage(normalizedOutput, plan),
    placeholderResponse: buildExecutionPlaceholder(normalizedOutput, plan),
    intentResolution,
    decision,
    plan,
    execution: {
      toolName: execution.toolName,
      status: executionStatus,
      normalizedOutput,
      traceMetadata: execution.traceMetadata,
    },
    responseMaterial: isJsonObject(normalizedOutput.summary)
      ? { ...normalizedOutput.summary }
      : undefined,
    traceMetadata: {
      ...traceMetadata,
      execution: execution.traceMetadata ? { ...execution.traceMetadata } : {},
    },
  };
}

function buildIntentResolution(
  decision: MetadataDiscoveryIntentDecision,
): IntentResolutionResult {
  const evidence = decision.evidence.map((item) => ({
    type: item.type,
    value: item.value,
  }));

  switch (decision.kind) {
    case "execute_candidate":
      return createResolvedIntentResolution({
        agentRunId: decision.agentRunId,
        resolvedIntentId: decision.intentId,
        confidence: decision.confidence,
        source: "deterministic_rule",
        reason: decision.reasonBrief,
        evidence,
        warnings: [...decision.signals],
        traceMetadata: buildMetadataDiscoveryIntentTraceMetadata(decision),
      });
    case "clarification_candidate":
      return createUnresolvedIntentResolution({
        agentRunId: decision.agentRunId,
        fallbackIntentId: "unknown",
        confidence: decision.confidence,
        source: "deterministic_rule",
        reason: decision.reasonBrief,
        evidence,
        warnings: ["metadata_discovery_needs_clarification"],
        traceMetadata: buildMetadataDiscoveryIntentTraceMetadata(decision),
      });
    case "unsupported":
      return createFallbackIntentResolution({
        agentRunId: decision.agentRunId,
        fallbackIntentId: "unknown",
        confidence: decision.confidence,
        source: "deterministic_rule",
        reason: decision.reasonBrief,
        evidence,
        warnings: ["metadata_discovery_legacy_fallback"],
        traceMetadata: buildMetadataDiscoveryIntentTraceMetadata(decision),
      });
    case "fallback":
      return createFallbackIntentResolution({
        agentRunId: decision.agentRunId,
        fallbackIntentId: "unknown",
        confidence: decision.confidence,
        source: "deterministic_rule",
        reason: decision.reasonBrief,
        evidence,
        warnings: ["metadata_discovery_legacy_fallback"],
        traceMetadata: buildMetadataDiscoveryIntentTraceMetadata(decision),
      });
  }
}

function buildMetadataDiscoveryExecutionContext(
  input: MetadataDiscoveryOrchestrationInput,
  plan: MetadataDiscoveryPlan,
): JsonObject {
  const executionContext = input.executionContext;
  const hostedExecutionEnabled =
    executionContext?.tableauMetadataHostedExecutionEnabled ?? false;
  const transportKind =
    executionContext?.tableauMetadataTransportKind ?? "fake";
  const noNetworkRequested = executionContext?.tableauMetadataNoNetwork ?? true;

  const context = {
    tableauMetadataTransportKind: transportKind,
    tableauMetadataHostedExecutionEnabled: hostedExecutionEnabled,
    tableauMetadataNoNetwork: noNetworkRequested,
    tableauMetadataRequestContext:
      executionContext?.tableauMetadataRequestContext ??
      buildRequestContext(input.intentResolutionInput, plan),
    tableauMetadataPreconditionInput: buildPreconditionInput(
      input,
      plan,
      transportKind,
      noNetworkRequested,
      hostedExecutionEnabled,
    ),
  };

  return context as unknown as JsonObject;
}

function buildPreconditionInput(
  input: MetadataDiscoveryOrchestrationInput,
  plan: MetadataDiscoveryPlan,
  transportKind: TableauMcpTransportKind,
  noNetworkRequested: boolean,
  hostedExecutionEnabled: boolean,
): Partial<TableauMetadataPreconditionInput> {
  const targetIdentifier = plan.executionCandidate?.targetIdentifier ?? "";
  const authenticatedUser = input.executionContext?.authenticatedUser;
  const authenticatedTableauContext = authenticatedUser
    ? {
        isAuthenticated: true,
        userId: authenticatedUser.userId,
        email: authenticatedUser.email,
        tableauUserId: authenticatedUser.tableauSubject,
        authMode: "oauth_delegated" as const,
      }
    : {
        isAuthenticated: true,
        authMode: "fake" as const,
      };

  const base: Partial<TableauMetadataPreconditionInput> = {
    authenticatedTableauContext,
    siteSettings:
      input.executionContext?.tableauMetadataPreconditionInput?.siteSettings ??
      ({
        status: hostedExecutionEnabled ? "enabled" : "not_required_for_fake",
        source: hostedExecutionEnabled ? "config" : "fake",
      } as const),
    transportConfig: {
      selectedTransportKind: transportKind,
      status: "selected",
      noNetwork: noNetworkRequested,
    },
    permission:
      input.executionContext?.tableauMetadataPreconditionInput?.permission ??
      ({
        status: "verified",
      } as const),
    identifierResolution: {
      datasource: {
        status: "resolved",
        target: "datasource",
        selectedId: targetIdentifier,
        selectedName: targetIdentifier,
        message: "Datasource identifier was provided by metadata discovery.",
      },
    },
    metadata: {
      metadataDiscovery: true,
      planState: plan.planState,
      targetType: plan.targetType,
      targetIdentifier,
      hostedExecutionEnabled,
      noNetworkRequested,
    },
  };

  const overrides = input.executionContext?.tableauMetadataPreconditionInput;
  return {
    ...base,
    ...(overrides ?? {}),
    metadata: {
      ...(base.metadata ?? {}),
      ...(overrides?.metadata ?? {}),
    },
  };
}

function buildDescribeDatasourceExecutionInput(
  plan: MetadataDiscoveryPlan,
  input: MetadataDiscoveryOrchestrationInput,
): TableauDescribeDatasourceInput {
  const targetIdentifier = plan.executionCandidate?.targetIdentifier ?? "";
  return {
    requestContext: buildRequestContext(input.intentResolutionInput, plan),
    datasource: {
      datasourceId: targetIdentifier,
      datasourceName: targetIdentifier,
    },
    includeFieldsSummary: true,
    includeConnectionSummary: true,
    maxFieldsForSummary: 5,
  };
}

function buildRequestContext(
  intentResolutionInput: IntentResolutionInput,
  plan: MetadataDiscoveryPlan,
): TableauDescribeDatasourceInput["requestContext"] {
  return {
    requestId: intentResolutionInput.agentRunId,
    correlationId: intentResolutionInput.agentRunId,
    agentRunId: intentResolutionInput.agentRunId,
    locale: readLocale(intentResolutionInput.metadata) ?? "en-US",
    maxItems: 25,
    includeHidden: false,
    includeTechnicalMetadata: false,
    metadata: {
      metadataDiscovery: true,
      intentId: plan.intentId,
      planState: plan.planState,
      targetType: plan.targetType,
      ...(plan.targetIdentifier
        ? { targetIdentifier: plan.targetIdentifier }
        : {}),
    },
  };
}

function buildMetadataDiscoveryOrchestrationTraceMetadata(input: {
  decision: MetadataDiscoveryIntentDecision;
  plan: MetadataDiscoveryPlan;
}): JsonObject {
  return {
    metadataDiscoveryDecision: buildMetadataDiscoveryIntentTraceMetadata(
      input.decision,
    ),
    metadataDiscoveryPlan: buildMetadataDiscoveryPlanTraceMetadata(input.plan),
  };
}

function buildExecutionMessage(
  execution: TableauMetadataNormalizedResult,
  plan: MetadataDiscoveryPlan,
): string {
  if (execution.status === "success" || execution.status === "partial") {
    return "Structured metadata discovery completed through the safe describeDatasource boundary.";
  }

  if (execution.status === "blocked") {
    return (
      execution.error?.message ??
      plan.safeMessage ??
      "Metadata discovery was blocked before execution."
    );
  }

  return (
    execution.error?.message ??
    execution.summary?.message?.toString() ??
    plan.safeMessage ??
    "Metadata discovery execution failed."
  );
}

function buildExecutionPlaceholder(
  execution: TableauMetadataNormalizedResult,
  plan: MetadataDiscoveryPlan,
): string {
  if (execution.status === "success" || execution.status === "partial") {
    const datasourceSummary = isJsonObject(execution.summary)
      ? execution.summary.datasource
      : undefined;
    if (isJsonObject(datasourceSummary)) {
      const datasourceName = readString(datasourceSummary.datasourceName);
      if (datasourceName) {
        return `Loaded datasource metadata for ${datasourceName}.`;
      }
    }

    return "Loaded datasource metadata through the safe describeDatasource boundary.";
  }

  return plan.safeMessage;
}

function mapPlanStateToOrchestrationStatus(
  planState: MetadataDiscoveryPlan["planState"],
): MetadataDiscoveryOrchestrationStatus {
  switch (planState) {
    case "clarification_required":
      return "clarification_required";
    case "unsupported":
      return "unsupported";
    case "fallback":
      return "fallback";
    case "executable":
      return "failed";
  }
}

function normalizeTargetContext(
  value: IntentResolutionInput["targetContext"],
): MetadataDiscoveryTargetContext | undefined {
  if (!isJsonObject(value)) {
    return undefined;
  }

  return {
    ...(isTargetType(value.targetType) ? { targetType: value.targetType } : {}),
    ...(typeof value.identifier === "string" && value.identifier.trim()
      ? { identifier: value.identifier.trim() }
      : {}),
    ...(typeof value.identifierType === "string" && value.identifierType.trim()
      ? { identifierType: value.identifierType.trim() }
      : {}),
    ...(Array.isArray(value.candidateTargetTypes)
      ? {
          candidateTargetTypes: normalizeCandidateTargetTypes(
            value.candidateTargetTypes as readonly JsonValue[],
          ),
        }
      : {}),
    ...(typeof value.candidateCount === "number" &&
    Number.isFinite(value.candidateCount)
      ? { candidateCount: value.candidateCount }
      : {}),
    ...(typeof value.source === "string" && value.source.trim()
      ? { source: value.source.trim() }
      : {}),
    ...(isJsonObject(value.metadata)
      ? { metadata: { ...value.metadata } }
      : {}),
  };
}

function toTableauMetadataNormalizedResult(
  value: JsonValue | undefined,
): TableauMetadataNormalizedResult {
  if (isJsonObject(value)) {
    return value as unknown as TableauMetadataNormalizedResult;
  }

  return {
    toolName: TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME,
    status: "failed",
    summary: {},
  };
}

function readLocale(metadata?: JsonObject): string | undefined {
  const locale = metadata?.locale;
  return typeof locale === "string" && locale.trim()
    ? locale.trim()
    : undefined;
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isTargetType(
  value: unknown,
): value is NonNullable<MetadataDiscoveryTargetContext["targetType"]> {
  return (
    value === "datasource" ||
    value === "workbook" ||
    value === "view" ||
    value === "unknown"
  );
}

function normalizeCandidateTargetTypes(
  value: readonly JsonValue[],
): readonly Exclude<
  NonNullable<MetadataDiscoveryTargetContext["targetType"]>,
  "unknown"
>[] {
  return value.filter(
    (
      targetType,
    ): targetType is Exclude<
      NonNullable<MetadataDiscoveryTargetContext["targetType"]>,
      "unknown"
    > =>
      targetType === "datasource" ||
      targetType === "workbook" ||
      targetType === "view",
  );
}
