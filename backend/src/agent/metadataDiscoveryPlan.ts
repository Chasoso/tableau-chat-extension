import {
  buildMetadataDiscoveryClarificationResponse,
  buildMetadataDiscoveryClarificationTraceMetadata,
  type MetadataDiscoveryClarificationReasonCode,
  type MetadataDiscoveryClarificationResponse,
  type MetadataDiscoveryClarificationResumeField,
} from "./metadataDiscoveryClarification";
import type {
  MetadataDiscoveryAmbiguityState,
  MetadataDiscoveryIntentDecision,
  MetadataDiscoveryIntentId,
  MetadataDiscoveryPreconditionCheck,
  MetadataDiscoveryPreconditionId,
  MetadataDiscoveryTargetContext,
  MetadataDiscoveryTargetType,
} from "./metadataDiscoveryIntent";
import type { TableauMetadataToolName } from "./tableauMetadataPreconditions";
import type { JsonObject } from "./types";
import {
  TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME,
  TABLEAU_METADATA_LIST_FIELDS_TOOL_NAME,
} from "./tableauMetadataTools";

export type MetadataDiscoveryPlanKind = "metadata_discovery.plan";

export type MetadataDiscoveryPlanState =
  | "clarification_required"
  | "executable"
  | "unsupported"
  | "fallback";

export type MetadataDiscoveryPlanReasonCode =
  | MetadataDiscoveryClarificationReasonCode
  | "safe_executable_datasource_candidate"
  | "legacy_fallback";

export type MetadataDiscoveryPlanTransition = {
  from: MetadataDiscoveryPlanState;
  to: MetadataDiscoveryPlanState;
  reasonCode: MetadataDiscoveryPlanReasonCode;
  description: string;
};

export type MetadataDiscoveryToolCandidateStatus =
  | "ready"
  | "deferred"
  | "blocked";

export type MetadataDiscoveryToolCandidateOperation =
  | "describeDatasource"
  | "listFields";

export type MetadataDiscoveryToolCandidate = {
  appToolName: TableauMetadataToolName;
  status: MetadataDiscoveryToolCandidateStatus;
  operation: MetadataDiscoveryToolCandidateOperation;
  targetType: Exclude<MetadataDiscoveryTargetType, "unknown">;
  targetIdentifier?: string;
  wrapperKind: "app_specific";
  boundaryKind: "hosted_wrapper" | "controlled_candidate";
  requiresHostedMcp: boolean;
  requiresNetwork: boolean;
  safeToExecute: boolean;
  rawToolExposure: false;
  safetyNotes: readonly string[];
  metadata?: JsonObject;
};

export type MetadataDiscoveryMetadataBoundary = {
  kind: "none" | "hosted_wrapper" | "controlled_candidate";
  toolName?: TableauMetadataToolName;
  operation?: MetadataDiscoveryToolCandidateOperation;
  wrapperKind?: "app_specific";
  safetyNotes: readonly string[];
};

export type MetadataDiscoveryExecutionGate = {
  canExecute: boolean;
  safeToExecute: boolean;
  requiresHostedMcp: boolean;
  requiresNetwork: boolean;
  candidate?: MetadataDiscoveryToolCandidate;
  preconditions: readonly MetadataDiscoveryPreconditionCheck[];
  safetyNotes: readonly string[];
};

export type MetadataDiscoveryClarificationGate = {
  requiresClarification: boolean;
  clarificationResponse?: MetadataDiscoveryClarificationResponse;
  resumeFields: readonly MetadataDiscoveryClarificationResumeField[];
  missingPreconditions: readonly MetadataDiscoveryPreconditionId[];
  safetyNotes: readonly string[];
};

export type MetadataDiscoveryUnsupportedGate = {
  isUnsupported: boolean;
  unsupportedReason?: string;
  fallbackRecommended: boolean;
  safetyNotes: readonly string[];
};

export type MetadataDiscoveryFallbackGate = {
  isFallback: boolean;
  fallbackReason?: string;
  safetyNotes: readonly string[];
};

export type MetadataDiscoveryPlan = {
  kind: MetadataDiscoveryPlanKind;
  intentId: MetadataDiscoveryIntentId;
  planState: MetadataDiscoveryPlanState;
  reasonCode: MetadataDiscoveryPlanReasonCode;
  reasonBrief: string;
  safeMessage: string;
  targetType: MetadataDiscoveryTargetType;
  targetIdentifier?: string;
  candidateTargetTypes: readonly Exclude<
    MetadataDiscoveryTargetType,
    "unknown"
  >[];
  ambiguityState: MetadataDiscoveryAmbiguityState;
  missingPreconditions: readonly MetadataDiscoveryPreconditionId[];
  clarification: MetadataDiscoveryClarificationGate;
  executionGate: MetadataDiscoveryExecutionGate;
  unsupportedGate: MetadataDiscoveryUnsupportedGate;
  fallbackGate: MetadataDiscoveryFallbackGate;
  metadataBoundary: MetadataDiscoveryMetadataBoundary;
  executionCandidate?: MetadataDiscoveryToolCandidate;
  deferredToolCandidates: readonly MetadataDiscoveryToolCandidate[];
  stateTransitions: readonly MetadataDiscoveryPlanTransition[];
  safetyNotes: readonly string[];
  traceSafeSummary: JsonObject;
  metadata?: JsonObject;
  traceMetadata?: JsonObject;
};

export type MetadataDiscoveryPlanInput = {
  decision: MetadataDiscoveryIntentDecision;
  targetContext?: MetadataDiscoveryTargetContext;
  clarificationResponse?: MetadataDiscoveryClarificationResponse;
  metadata?: JsonObject;
};

export function buildMetadataDiscoveryPlan(
  input: MetadataDiscoveryPlanInput,
): MetadataDiscoveryPlan {
  const decision = input.decision;
  const targetType = resolveTargetType(decision, input.targetContext);
  const targetIdentifier = input.targetContext?.identifier?.trim();
  const clarificationResponse =
    input.clarificationResponse ??
    buildMetadataDiscoveryClarificationResponse(decision);
  const planState = resolvePlanState(decision);
  const reasonCode = resolvePlanReasonCode(decision, clarificationResponse);
  const executionCandidate = buildExecutionCandidate({
    targetType,
    targetIdentifier,
    planState,
  });
  const deferredToolCandidates = buildDeferredToolCandidates({
    targetType,
    targetIdentifier,
  });
  const clarification = buildClarificationGate(
    decision,
    clarificationResponse,
    targetIdentifier,
  );
  const unsupportedGate = buildUnsupportedGate(decision, clarificationResponse);
  const fallbackGate = buildFallbackGate(decision, clarificationResponse);
  const executionGate = buildExecutionGate(
    decision,
    executionCandidate,
    planState,
  );
  const metadataBoundary = buildMetadataBoundary(
    executionCandidate,
    deferredToolCandidates,
  );
  const safetyNotes = buildSafetyNotes({
    decision,
    planState,
    executionCandidate,
    clarificationResponse,
  });

  return {
    kind: "metadata_discovery.plan",
    intentId: decision.intentId,
    planState,
    reasonCode,
    reasonBrief: resolveReasonBrief(decision, planState, clarificationResponse),
    safeMessage: resolveSafeMessage(decision, planState, clarificationResponse),
    targetType,
    ...(targetIdentifier ? { targetIdentifier } : {}),
    candidateTargetTypes: [...decision.candidateTargetTypes],
    ambiguityState: decision.ambiguityState,
    missingPreconditions: [...decision.missingPreconditions],
    clarification,
    executionGate,
    unsupportedGate,
    fallbackGate,
    metadataBoundary,
    ...(executionCandidate ? { executionCandidate } : {}),
    deferredToolCandidates,
    stateTransitions: buildStateTransitions(planState),
    safetyNotes,
    traceSafeSummary: buildTraceSafeSummary({
      decision,
      planState,
      reasonCode,
      targetType,
      targetIdentifier,
      clarificationResponse,
      executionCandidate,
      deferredToolCandidates,
      metadataBoundary,
      executionGate,
      clarification,
      unsupportedGate,
      fallbackGate,
      safetyNotes,
    }),
    ...(input.metadata ? { metadata: { ...input.metadata } } : {}),
    traceMetadata: buildTraceMetadata({
      decision,
      planState,
      reasonCode,
      targetType,
      targetIdentifier,
      clarificationResponse,
      executionCandidate,
      deferredToolCandidates,
      metadataBoundary,
      executionGate,
      clarification,
      unsupportedGate,
      fallbackGate,
      safetyNotes,
    }),
  };
}

export function buildMetadataDiscoveryPlanTraceMetadata(
  plan: MetadataDiscoveryPlan,
): JsonObject {
  return {
    kind: plan.kind,
    intentId: plan.intentId,
    planState: plan.planState,
    reasonCode: plan.reasonCode,
    reasonBrief: plan.reasonBrief,
    safeMessage: plan.safeMessage,
    targetType: plan.targetType,
    ...(plan.targetIdentifier
      ? { targetIdentifier: plan.targetIdentifier }
      : {}),
    candidateTargetTypes: [...plan.candidateTargetTypes],
    ambiguityState: plan.ambiguityState,
    missingPreconditions: [...plan.missingPreconditions],
    clarification: {
      requiresClarification: plan.clarification.requiresClarification,
      ...(plan.clarification.clarificationResponse
        ? {
            clarificationResponse:
              buildMetadataDiscoveryClarificationTraceMetadata(
                plan.clarification.clarificationResponse,
              ),
          }
        : {}),
      resumeFields: [...plan.clarification.resumeFields],
      missingPreconditions: [...plan.clarification.missingPreconditions],
      safetyNotes: [...plan.clarification.safetyNotes],
    },
    executionGate: {
      canExecute: plan.executionGate.canExecute,
      safeToExecute: plan.executionGate.safeToExecute,
      requiresHostedMcp: plan.executionGate.requiresHostedMcp,
      requiresNetwork: plan.executionGate.requiresNetwork,
      ...(plan.executionGate.candidate
        ? {
            candidate: buildToolCandidateTraceMetadata(
              plan.executionGate.candidate,
            ),
          }
        : {}),
      preconditions: plan.executionGate.preconditions.map((item) => ({
        id: item.id,
        required: item.required,
        satisfied: item.satisfied,
        reasonBrief: item.reasonBrief,
        ...(item.metadata ? { metadata: { ...item.metadata } } : {}),
      })),
      safetyNotes: [...plan.executionGate.safetyNotes],
    },
    unsupportedGate: {
      isUnsupported: plan.unsupportedGate.isUnsupported,
      ...(plan.unsupportedGate.unsupportedReason
        ? { unsupportedReason: plan.unsupportedGate.unsupportedReason }
        : {}),
      fallbackRecommended: plan.unsupportedGate.fallbackRecommended,
      safetyNotes: [...plan.unsupportedGate.safetyNotes],
    },
    fallbackGate: {
      isFallback: plan.fallbackGate.isFallback,
      ...(plan.fallbackGate.fallbackReason
        ? { fallbackReason: plan.fallbackGate.fallbackReason }
        : {}),
      safetyNotes: [...plan.fallbackGate.safetyNotes],
    },
    metadataBoundary: {
      kind: plan.metadataBoundary.kind,
      ...(plan.metadataBoundary.toolName
        ? { toolName: plan.metadataBoundary.toolName }
        : {}),
      ...(plan.metadataBoundary.operation
        ? { operation: plan.metadataBoundary.operation }
        : {}),
      ...(plan.metadataBoundary.wrapperKind
        ? { wrapperKind: plan.metadataBoundary.wrapperKind }
        : {}),
      safetyNotes: [...plan.metadataBoundary.safetyNotes],
    },
    ...(plan.executionCandidate
      ? {
          executionCandidate: buildToolCandidateTraceMetadata(
            plan.executionCandidate,
          ),
        }
      : {}),
    deferredToolCandidates: plan.deferredToolCandidates.map((candidate) =>
      buildToolCandidateTraceMetadata(candidate),
    ),
    stateTransitions: plan.stateTransitions.map((transition) => ({
      from: transition.from,
      to: transition.to,
      reasonCode: transition.reasonCode,
      description: transition.description,
    })),
    safetyNotes: [...plan.safetyNotes],
    traceSafeSummary: { ...plan.traceSafeSummary },
    ...(plan.metadata ? { metadata: { ...plan.metadata } } : {}),
    ...(plan.traceMetadata ? { traceMetadata: { ...plan.traceMetadata } } : {}),
  };
}

function resolvePlanState(
  decision: MetadataDiscoveryIntentDecision,
): MetadataDiscoveryPlanState {
  switch (decision.kind) {
    case "execute_candidate":
      return "executable";
    case "clarification_candidate":
      return "clarification_required";
    case "unsupported":
      return "unsupported";
    case "fallback":
      return "fallback";
  }
}

function resolvePlanReasonCode(
  decision: MetadataDiscoveryIntentDecision,
  clarificationResponse?: MetadataDiscoveryClarificationResponse,
): MetadataDiscoveryPlanReasonCode {
  if (decision.kind === "execute_candidate") {
    return "safe_executable_datasource_candidate";
  }
  if (decision.kind === "fallback") {
    return "legacy_fallback";
  }
  if (clarificationResponse) {
    return clarificationResponse.reasonCode;
  }
  return "legacy_fallback";
}

function buildExecutionCandidate(input: {
  targetType: MetadataDiscoveryTargetType;
  targetIdentifier?: string;
  planState: MetadataDiscoveryPlanState;
}): MetadataDiscoveryToolCandidate | undefined {
  if (input.planState !== "executable") {
    return undefined;
  }
  if (input.targetType !== "datasource" || !input.targetIdentifier) {
    return undefined;
  }

  return {
    appToolName: TABLEAU_METADATA_DESCRIBE_DATASOURCE_TOOL_NAME,
    status: "ready",
    operation: "describeDatasource",
    targetType: "datasource",
    targetIdentifier: input.targetIdentifier,
    wrapperKind: "app_specific",
    boundaryKind: "hosted_wrapper",
    requiresHostedMcp: true,
    requiresNetwork: true,
    safeToExecute: true,
    rawToolExposure: false,
    safetyNotes: [
      "Read-only metadata summary only.",
      "No raw MCP or transport payload exposure.",
      "No underlying data, row data, or field values.",
    ],
    metadata: {
      toolFamily: "tableau.metadata",
      boundary: "describeDatasource",
      wrapperKind: "app_specific",
      targetType: "datasource",
    },
  };
}

function buildDeferredToolCandidates(input: {
  targetType: MetadataDiscoveryTargetType;
  targetIdentifier?: string;
}): readonly MetadataDiscoveryToolCandidate[] {
  if (input.targetType !== "datasource") {
    return [];
  }

  return [
    {
      appToolName: TABLEAU_METADATA_LIST_FIELDS_TOOL_NAME,
      status: "deferred",
      operation: "listFields",
      targetType: "datasource",
      ...(input.targetIdentifier
        ? { targetIdentifier: input.targetIdentifier }
        : {}),
      wrapperKind: "app_specific",
      boundaryKind: "controlled_candidate",
      requiresHostedMcp: false,
      requiresNetwork: false,
      safeToExecute: false,
      rawToolExposure: false,
      safetyNotes: [
        "Controlled / truncated / permission-aware candidate only.",
        "No execution wiring in #186.",
        "No raw MCP or transport payload exposure.",
      ],
      metadata: {
        toolFamily: "tableau.metadata",
        boundary: "listFields",
        wrapperKind: "app_specific",
        targetType: "datasource",
        deferred: true,
      },
    },
  ];
}

function buildClarificationGate(
  decision: MetadataDiscoveryIntentDecision,
  clarificationResponse: MetadataDiscoveryClarificationResponse | undefined,
  targetIdentifier?: string,
): MetadataDiscoveryClarificationGate {
  const requiresClarification = decision.kind === "clarification_candidate";
  return {
    requiresClarification,
    ...(clarificationResponse
      ? { clarificationResponse }
      : requiresClarification
        ? {
            clarificationResponse:
              buildMetadataDiscoveryClarificationResponse(decision),
          }
        : {}),
    resumeFields: clarificationResponse?.resumeContract.requiredFields ?? [],
    missingPreconditions: [...decision.missingPreconditions],
    safetyNotes: requiresClarification
      ? [
          "Clarification response only; no ToolLayer execution.",
          "Caller should re-run metadata_discovery with clarified fields.",
        ]
      : targetIdentifier
        ? ["Clarification gate not required for executable plans."]
        : ["Clarification gate not required."],
  };
}

function buildExecutionGate(
  decision: MetadataDiscoveryIntentDecision,
  executionCandidate: MetadataDiscoveryToolCandidate | undefined,
  planState: MetadataDiscoveryPlanState,
): MetadataDiscoveryExecutionGate {
  const canExecute = planState === "executable" && Boolean(executionCandidate);
  return {
    canExecute,
    safeToExecute: canExecute,
    requiresHostedMcp: canExecute,
    requiresNetwork: canExecute,
    ...(executionCandidate ? { candidate: executionCandidate } : {}),
    preconditions: [...decision.preconditions],
    safetyNotes: canExecute
      ? [
          "Narrow metadata-only execution candidate.",
          "ToolLayer-friendly app-specific wrapper only.",
        ]
      : ["Execution gate closed."],
  };
}

function buildUnsupportedGate(
  decision: MetadataDiscoveryIntentDecision,
  clarificationResponse?: MetadataDiscoveryClarificationResponse,
): MetadataDiscoveryUnsupportedGate {
  const isUnsupported = decision.kind === "unsupported";
  return {
    isUnsupported,
    ...(decision.unsupportedReason
      ? { unsupportedReason: decision.unsupportedReason }
      : {}),
    fallbackRecommended:
      isUnsupported || clarificationResponse?.fallbackRecommended === true,
    safetyNotes: isUnsupported
      ? ["Unsafe or out-of-scope request."]
      : ["Unsupported gate not active."],
  };
}

function buildFallbackGate(
  decision: MetadataDiscoveryIntentDecision,
  clarificationResponse?: MetadataDiscoveryClarificationResponse,
): MetadataDiscoveryFallbackGate {
  const isFallback = decision.kind === "fallback";
  return {
    isFallback,
    ...(isFallback
      ? { fallbackReason: decision.reasonBrief }
      : clarificationResponse?.fallbackRecommended
        ? { fallbackReason: clarificationResponse.safeMessage }
        : {}),
    safetyNotes: isFallback
      ? ["Legacy free-form chat fallback."]
      : ["Fallback gate not active."],
  };
}

function buildMetadataBoundary(
  executionCandidate: MetadataDiscoveryToolCandidate | undefined,
  deferredToolCandidates: readonly MetadataDiscoveryToolCandidate[],
): MetadataDiscoveryMetadataBoundary {
  if (executionCandidate) {
    return {
      kind: "hosted_wrapper",
      toolName: executionCandidate.appToolName,
      operation: executionCandidate.operation,
      wrapperKind: executionCandidate.wrapperKind,
      safetyNotes: [...executionCandidate.safetyNotes],
    };
  }

  const deferred = deferredToolCandidates[0];
  if (deferred) {
    return {
      kind: "controlled_candidate",
      toolName: deferred.appToolName,
      operation: deferred.operation,
      wrapperKind: deferred.wrapperKind,
      safetyNotes: [...deferred.safetyNotes],
    };
  }

  return {
    kind: "none",
    safetyNotes: ["No metadata boundary selected yet."],
  };
}

function buildStateTransitions(
  planState: MetadataDiscoveryPlanState,
): readonly MetadataDiscoveryPlanTransition[] {
  switch (planState) {
    case "clarification_required":
      return [
        {
          from: "clarification_required",
          to: "executable",
          reasonCode: "safe_executable_datasource_candidate",
          description:
            "Clarified target type and identifier may unlock execution.",
        },
        {
          from: "clarification_required",
          to: "unsupported",
          reasonCode: "unsupported_discovery_request",
          description:
            "Clarification may reveal an unsafe or out-of-scope request.",
        },
        {
          from: "clarification_required",
          to: "fallback",
          reasonCode: "legacy_fallback",
          description: "Caller can remain on the legacy fallback path.",
        },
      ];
    case "executable":
      return [
        {
          from: "executable",
          to: "unsupported",
          reasonCode: "unsupported_discovery_request",
          description:
            "Later boundary checks may still reject unsafe execution.",
        },
        {
          from: "executable",
          to: "fallback",
          reasonCode: "legacy_fallback",
          description:
            "Execution may be deferred to the legacy path if needed.",
        },
      ];
    case "unsupported":
      return [
        {
          from: "unsupported",
          to: "fallback",
          reasonCode: "legacy_fallback",
          description: "Unsafe requests should remain on the fallback path.",
        },
      ];
    case "fallback":
      return [
        {
          from: "fallback",
          to: "clarification_required",
          reasonCode: "missing_target",
          description:
            "A restated request may re-enter discovery through clarification.",
        },
      ];
  }
}

function buildSafetyNotes(input: {
  decision: MetadataDiscoveryIntentDecision;
  planState: MetadataDiscoveryPlanState;
  executionCandidate?: MetadataDiscoveryToolCandidate;
  clarificationResponse?: MetadataDiscoveryClarificationResponse;
}): readonly string[] {
  const notes = [
    "No raw MCP or transport payload exposure.",
    "No underlying data, field values, or row data.",
    "No write-capable tools.",
  ];

  if (input.executionCandidate) {
    notes.push(
      "Execution candidate is restricted to an app-level wrapper tool.",
      "Hosted opt-in and network checks are deferred to later boundaries.",
    );
  }

  if (input.clarificationResponse) {
    notes.push("Clarification state remains execution-free.");
  }

  if (input.planState === "fallback") {
    notes.push("Legacy chat fallback remains available.");
  }

  return notes;
}

function resolveTargetType(
  decision: MetadataDiscoveryIntentDecision,
  targetContext?: MetadataDiscoveryTargetContext,
): MetadataDiscoveryTargetType {
  return (
    targetContext?.targetType ??
    (decision.targetTypeCandidate === "unknown"
      ? (decision.candidateTargetTypes[0] ?? "unknown")
      : decision.targetTypeCandidate)
  );
}

function resolveReasonBrief(
  decision: MetadataDiscoveryIntentDecision,
  planState: MetadataDiscoveryPlanState,
  clarificationResponse?: MetadataDiscoveryClarificationResponse,
): string {
  if (planState === "executable") {
    return decision.reasonBrief;
  }
  if (clarificationResponse) {
    return (
      clarificationResponse.clarificationReason ??
      clarificationResponse.safeMessage
    );
  }
  if (planState === "fallback") {
    return decision.reasonBrief;
  }
  return decision.reasonBrief;
}

function resolveSafeMessage(
  decision: MetadataDiscoveryIntentDecision,
  planState: MetadataDiscoveryPlanState,
  clarificationResponse?: MetadataDiscoveryClarificationResponse,
): string {
  if (planState === "clarification_required" && clarificationResponse) {
    return clarificationResponse.safeMessage;
  }
  if (planState === "unsupported" && clarificationResponse) {
    return clarificationResponse.safeMessage;
  }
  if (planState === "fallback") {
    return decision.safeUserFacingNote;
  }
  return decision.safeUserFacingNote;
}

function buildTraceSafeSummary(input: {
  decision: MetadataDiscoveryIntentDecision;
  planState: MetadataDiscoveryPlanState;
  reasonCode: MetadataDiscoveryPlanReasonCode;
  targetType: MetadataDiscoveryTargetType;
  targetIdentifier?: string;
  clarificationResponse?: MetadataDiscoveryClarificationResponse;
  executionCandidate?: MetadataDiscoveryToolCandidate;
  deferredToolCandidates: readonly MetadataDiscoveryToolCandidate[];
  metadataBoundary: MetadataDiscoveryMetadataBoundary;
  executionGate: MetadataDiscoveryExecutionGate;
  clarification: MetadataDiscoveryClarificationGate;
  unsupportedGate: MetadataDiscoveryUnsupportedGate;
  fallbackGate: MetadataDiscoveryFallbackGate;
  safetyNotes: readonly string[];
}): JsonObject {
  return {
    agentRunId: input.decision.agentRunId,
    intentId: input.decision.intentId,
    planState: input.planState,
    reasonCode: input.reasonCode,
    targetType: input.targetType,
    ...(input.targetIdentifier
      ? { targetIdentifier: input.targetIdentifier }
      : {}),
    candidateTargetTypes: [...input.decision.candidateTargetTypes],
    ambiguityState: input.decision.ambiguityState,
    safeToExecute: input.executionGate.safeToExecute,
    requiresHostedMcp: input.executionGate.requiresHostedMcp,
    requiresNetwork: input.executionGate.requiresNetwork,
    hasClarification: input.clarification.requiresClarification,
    ...(input.clarificationResponse
      ? { clarificationReasonCode: input.clarificationResponse.reasonCode }
      : {}),
    unsupported: input.unsupportedGate.isUnsupported,
    fallback: input.fallbackGate.isFallback,
    ...(input.executionCandidate
      ? {
          executionCandidate: {
            appToolName: input.executionCandidate.appToolName,
            operation: input.executionCandidate.operation,
            status: input.executionCandidate.status,
          },
        }
      : {}),
    deferredToolCandidates: input.deferredToolCandidates.map((candidate) => ({
      appToolName: candidate.appToolName,
      operation: candidate.operation,
      status: candidate.status,
    })),
    metadataBoundary: {
      kind: input.metadataBoundary.kind,
      ...(input.metadataBoundary.toolName
        ? { toolName: input.metadataBoundary.toolName }
        : {}),
      ...(input.metadataBoundary.operation
        ? { operation: input.metadataBoundary.operation }
        : {}),
    },
    safetyNotes: [...input.safetyNotes],
  };
}

function buildTraceMetadata(input: {
  decision: MetadataDiscoveryIntentDecision;
  planState: MetadataDiscoveryPlanState;
  reasonCode: MetadataDiscoveryPlanReasonCode;
  targetType: MetadataDiscoveryTargetType;
  targetIdentifier?: string;
  clarificationResponse?: MetadataDiscoveryClarificationResponse;
  executionCandidate?: MetadataDiscoveryToolCandidate;
  deferredToolCandidates: readonly MetadataDiscoveryToolCandidate[];
  metadataBoundary: MetadataDiscoveryMetadataBoundary;
  executionGate: MetadataDiscoveryExecutionGate;
  clarification: MetadataDiscoveryClarificationGate;
  unsupportedGate: MetadataDiscoveryUnsupportedGate;
  fallbackGate: MetadataDiscoveryFallbackGate;
  safetyNotes: readonly string[];
}): JsonObject {
  return {
    kind: "metadata_discovery.plan",
    intentId: input.decision.intentId,
    planState: input.planState,
    reasonCode: input.reasonCode,
    reasonBrief: input.decision.reasonBrief,
    safeMessage: resolveSafeMessage(
      input.decision,
      input.planState,
      input.clarificationResponse,
    ),
    targetType: input.targetType,
    ...(input.targetIdentifier
      ? { targetIdentifier: input.targetIdentifier }
      : {}),
    candidateTargetTypes: [...input.decision.candidateTargetTypes],
    ambiguityState: input.decision.ambiguityState,
    missingPreconditions: [...input.decision.missingPreconditions],
    clarification: {
      requiresClarification: input.clarification.requiresClarification,
      ...(input.clarification.clarificationResponse
        ? {
            clarificationResponse:
              buildMetadataDiscoveryClarificationTraceMetadata(
                input.clarification.clarificationResponse,
              ),
          }
        : {}),
      resumeFields: [...input.clarification.resumeFields],
      missingPreconditions: [...input.clarification.missingPreconditions],
      safetyNotes: [...input.clarification.safetyNotes],
    },
    executionGate: {
      canExecute: input.executionGate.canExecute,
      safeToExecute: input.executionGate.safeToExecute,
      requiresHostedMcp: input.executionGate.requiresHostedMcp,
      requiresNetwork: input.executionGate.requiresNetwork,
      ...(input.executionGate.candidate
        ? {
            candidate: buildToolCandidateTraceMetadata(
              input.executionGate.candidate,
            ),
          }
        : {}),
      preconditions: input.executionGate.preconditions.map((item) => ({
        id: item.id,
        required: item.required,
        satisfied: item.satisfied,
        reasonBrief: item.reasonBrief,
        ...(item.metadata ? { metadata: { ...item.metadata } } : {}),
      })),
      safetyNotes: [...input.executionGate.safetyNotes],
    },
    unsupportedGate: {
      isUnsupported: input.unsupportedGate.isUnsupported,
      ...(input.unsupportedGate.unsupportedReason
        ? { unsupportedReason: input.unsupportedGate.unsupportedReason }
        : {}),
      fallbackRecommended: input.unsupportedGate.fallbackRecommended,
      safetyNotes: [...input.unsupportedGate.safetyNotes],
    },
    fallbackGate: {
      isFallback: input.fallbackGate.isFallback,
      ...(input.fallbackGate.fallbackReason
        ? { fallbackReason: input.fallbackGate.fallbackReason }
        : {}),
      safetyNotes: [...input.fallbackGate.safetyNotes],
    },
    metadataBoundary: {
      kind: input.metadataBoundary.kind,
      ...(input.metadataBoundary.toolName
        ? { toolName: input.metadataBoundary.toolName }
        : {}),
      ...(input.metadataBoundary.operation
        ? { operation: input.metadataBoundary.operation }
        : {}),
      ...(input.metadataBoundary.wrapperKind
        ? { wrapperKind: input.metadataBoundary.wrapperKind }
        : {}),
      safetyNotes: [...input.metadataBoundary.safetyNotes],
    },
    ...(input.executionCandidate
      ? {
          executionCandidate: buildToolCandidateTraceMetadata(
            input.executionCandidate,
          ),
        }
      : {}),
    deferredToolCandidates: input.deferredToolCandidates.map((candidate) =>
      buildToolCandidateTraceMetadata(candidate),
    ),
    stateTransitions: buildStateTransitions(input.planState).map(
      (transition) => ({
        from: transition.from,
        to: transition.to,
        reasonCode: transition.reasonCode,
        description: transition.description,
      }),
    ),
    safetyNotes: [...input.safetyNotes],
    ...(input.executionGate.candidate
      ? { safeToExecute: input.executionGate.safeToExecute }
      : { safeToExecute: false }),
    unsupported: input.unsupportedGate.isUnsupported,
    fallback: input.fallbackGate.isFallback,
  };
}

function buildToolCandidateTraceMetadata(
  candidate: MetadataDiscoveryToolCandidate,
): JsonObject {
  return {
    appToolName: candidate.appToolName,
    status: candidate.status,
    operation: candidate.operation,
    targetType: candidate.targetType,
    ...(candidate.targetIdentifier
      ? { targetIdentifier: candidate.targetIdentifier }
      : {}),
    wrapperKind: candidate.wrapperKind,
    boundaryKind: candidate.boundaryKind,
    requiresHostedMcp: candidate.requiresHostedMcp,
    requiresNetwork: candidate.requiresNetwork,
    safeToExecute: candidate.safeToExecute,
    rawToolExposure: candidate.rawToolExposure,
    safetyNotes: [...candidate.safetyNotes],
    ...(candidate.metadata ? { metadata: { ...candidate.metadata } } : {}),
  };
}
