import {
  createFallbackIntentResolution,
  createIntentEvidence,
  createResolvedIntentResolution,
  createUnresolvedIntentResolution,
  type IntentId,
  type IntentResolutionInput,
  type IntentResolutionSelectedMarksSummary,
  type IntentResolutionResult,
  type IntentResolver,
} from "./intent";
import {
  buildMetadataDiscoveryClarificationResponse,
  buildMetadataDiscoveryClarificationTraceMetadata,
} from "./metadataDiscoveryClarification";
import {
  buildMetadataDiscoveryIntentTraceMetadata,
  classifyMetadataDiscoveryIntent,
} from "./metadataDiscoveryIntent";
import type { JsonObject } from "./types";

const DEFAULT_SUPPORTED_INTENT_IDS: readonly IntentId[] = [
  "selected_mark_explanation",
  "current_dashboard_summary",
  "metadata_discovery",
];

const DEFAULT_SELECTED_MARK_ACTION_IDS = new Map<string, IntentId>([
  ["explain_selection", "selected_mark_explanation"],
  ["selected_mark_explanation", "selected_mark_explanation"],
]);

const SELECTED_MARK_KEYWORDS = [
  "selected_mark_explanation",
  "explain_selection",
  "this selection",
  "selected marks",
  "selected",
  "selection",
] as const;

export type MinimalIntentResolverOptions = {
  supportedIntentIds?: readonly IntentId[];
  selectedMarkActionIds?:
    | ReadonlyMap<string, IntentId>
    | Record<string, IntentId>;
};

export class MinimalIntentResolver implements IntentResolver {
  private readonly supportedIntentIds: readonly IntentId[];
  private readonly selectedMarkActionIds: Map<string, IntentId>;

  constructor(options: MinimalIntentResolverOptions = {}) {
    this.supportedIntentIds =
      options.supportedIntentIds ?? DEFAULT_SUPPORTED_INTENT_IDS;
    this.selectedMarkActionIds = normalizeActionMap(
      options.selectedMarkActionIds ?? DEFAULT_SELECTED_MARK_ACTION_IDS,
    );
  }

  async resolve(input: IntentResolutionInput): Promise<IntentResolutionResult> {
    const requestedIntentRaw = input.requestedIntentId as unknown;
    const requestedIntentId = normalizeIntentId(requestedIntentRaw);
    const actionIntentId = normalizeIntentId(
      resolveActionIntentId(input.frontendActionId, this.selectedMarkActionIds),
    );
    const selectionSummary = input.contextSummary?.selectedMarks;
    const hasSelectedMarks = hasSelectedMarksSummary(selectionSummary);
    const selectedMarkCount = selectionSummary?.totalCount ?? 0;
    const availableIntentIds = new Set<IntentId>(
      input.availableIntentIds?.filter(isKnownIntentId) ??
        this.supportedIntentIds,
    );

    if (requestedIntentRaw !== undefined) {
      const explicitResolution = resolveExplicitIntent({
        input,
        requestedIntentRaw,
        requestedIntentId,
        availableIntentIds,
        hasSelectedMarks,
        selectedMarkCount,
      });
      if (explicitResolution) {
        return explicitResolution;
      }
    }

    if (actionIntentId) {
      const uiActionResolution = resolveUiActionIntent({
        input,
        actionIntentId,
        availableIntentIds,
        hasSelectedMarks,
        selectedMarkCount,
      });
      if (uiActionResolution) {
        return uiActionResolution;
      }
    }

    const deterministicResolution = resolveDeterministicIntent({
      input,
      availableIntentIds,
      hasSelectedMarks,
      selectedMarkCount,
    });
    if (deterministicResolution) {
      return deterministicResolution;
    }

    return createFallbackIntentResolution({
      agentRunId: input.agentRunId,
      fallbackIntentId: "unknown",
      confidence: 0,
      source: "fallback",
      reason: "No matching intent could be resolved.",
      warnings: [
        "no_matching_intent",
        ...(hasSelectedMarks ? [] : ["missing_selected_marks"]),
      ],
      evidence: buildCommonEvidence({
        input,
        hasSelectedMarks,
        selectedMarkCount,
      }),
      traceMetadata: {
        source: "fallback",
        reason: "No matching intent could be resolved.",
      },
    });
  }
}

export function createMinimalIntentResolver(
  options?: MinimalIntentResolverOptions,
): IntentResolver {
  return new MinimalIntentResolver(options);
}

export function createDefaultIntentResolver(): IntentResolver {
  return createMinimalIntentResolver();
}

function resolveExplicitIntent(input: {
  input: IntentResolutionInput;
  requestedIntentRaw: unknown;
  requestedIntentId?: IntentId;
  availableIntentIds: Set<IntentId>;
  hasSelectedMarks: boolean;
  selectedMarkCount: number;
}): IntentResolutionResult | undefined {
  const {
    input: resolutionInput,
    requestedIntentRaw,
    requestedIntentId,
    availableIntentIds,
  } = input;

  if (!isKnownIntentId(requestedIntentRaw)) {
    return createUnresolvedIntentResolution({
      agentRunId: resolutionInput.agentRunId,
      fallbackIntentId: "unknown",
      confidence: 0,
      source: "explicit",
      reason: `Requested intent '${String(requestedIntentRaw)}' is not supported.`,
      warnings: ["unsupported_requested_intent"],
      evidence: buildCommonEvidence({
        input: resolutionInput,
        requestedIntentId: String(requestedIntentRaw),
        hasSelectedMarks: input.hasSelectedMarks,
        selectedMarkCount: input.selectedMarkCount,
      }),
      traceMetadata: {
        requestedIntentId: String(requestedIntentRaw),
        source: "explicit",
      },
    });
  }

  const resolvedIntentId = requestedIntentId ?? requestedIntentRaw;

  if (!availableIntentIds.has(resolvedIntentId as IntentId)) {
    return createUnresolvedIntentResolution({
      agentRunId: resolutionInput.agentRunId,
      fallbackIntentId: "unknown",
      confidence: 0,
      source: "explicit",
      reason: `Requested intent '${String(resolvedIntentId)}' is not available in the current resolver scope.`,
      warnings: ["requested_intent_not_available"],
      evidence: buildCommonEvidence({
        input: resolutionInput,
        requestedIntentId: String(resolvedIntentId),
        hasSelectedMarks: input.hasSelectedMarks,
        selectedMarkCount: input.selectedMarkCount,
      }),
      traceMetadata: {
        requestedIntentId: String(resolvedIntentId),
        source: "explicit",
        availability: "unavailable",
      },
    });
  }

  if (
    resolvedIntentId === "selected_mark_explanation" &&
    !input.hasSelectedMarks
  ) {
    return createUnresolvedIntentResolution({
      agentRunId: resolutionInput.agentRunId,
      fallbackIntentId: "unknown",
      confidence: 0.1,
      source: "explicit",
      reason: "selected_mark_explanation requires at least one selected mark.",
      warnings: ["missing_selected_marks"],
      evidence: buildCommonEvidence({
        input: resolutionInput,
        requestedIntentId: resolvedIntentId,
        hasSelectedMarks: input.hasSelectedMarks,
        selectedMarkCount: input.selectedMarkCount,
      }),
      traceMetadata: {
        requestedIntentId: resolvedIntentId,
        source: "explicit",
        precondition: "missing_selected_marks",
      },
    });
  }

  return createResolvedIntentResolution({
    agentRunId: resolutionInput.agentRunId,
    resolvedIntentId: resolvedIntentId as IntentId,
    confidence: resolvedIntentId === "selected_mark_explanation" ? 0.99 : 0.97,
    source: "explicit",
    reason: `Explicit intent '${String(resolvedIntentId)}' was provided.`,
    evidence: buildCommonEvidence({
      input: resolutionInput,
      requestedIntentId: String(resolvedIntentId),
      hasSelectedMarks: input.hasSelectedMarks,
      selectedMarkCount: input.selectedMarkCount,
    }),
    traceMetadata: {
      requestedIntentId: String(resolvedIntentId),
      source: "explicit",
      availableIntentIds: [...availableIntentIds],
    },
  });
}

function resolveUiActionIntent(input: {
  input: IntentResolutionInput;
  actionIntentId?: IntentId;
  availableIntentIds: Set<IntentId>;
  hasSelectedMarks: boolean;
  selectedMarkCount: number;
}): IntentResolutionResult | undefined {
  const { input: resolutionInput, actionIntentId, availableIntentIds } = input;

  const resolvedActionIntentId = actionIntentId;
  if (!resolvedActionIntentId) {
    return undefined;
  }

  if (!availableIntentIds.has(resolvedActionIntentId)) {
    return createUnresolvedIntentResolution({
      agentRunId: resolutionInput.agentRunId,
      fallbackIntentId: "unknown",
      confidence: 0,
      source: "ui_action",
      reason: `Action '${resolutionInput.frontendActionId}' maps to unsupported intent '${resolvedActionIntentId}'.`,
      warnings: ["unsupported_ui_action_intent"],
      evidence: buildCommonEvidence({
        input: resolutionInput,
        actionId: resolutionInput.frontendActionId,
        hasSelectedMarks: input.hasSelectedMarks,
        selectedMarkCount: input.selectedMarkCount,
      }),
      traceMetadata: buildUiActionTraceMetadata({
        actionId: resolutionInput.frontendActionId,
        intentId: resolvedActionIntentId,
        source: "ui_action",
      }),
    });
  }

  if (
    resolvedActionIntentId === "selected_mark_explanation" &&
    !input.hasSelectedMarks
  ) {
    return createFallbackIntentResolution({
      agentRunId: resolutionInput.agentRunId,
      fallbackIntentId: "selected_mark_explanation",
      confidence: 0.2,
      source: "ui_action",
      reason:
        "The action points to selected_mark_explanation, but no selected marks are available.",
      warnings: ["missing_selected_marks"],
      evidence: buildCommonEvidence({
        input: resolutionInput,
        actionId: resolutionInput.frontendActionId,
        hasSelectedMarks: input.hasSelectedMarks,
        selectedMarkCount: input.selectedMarkCount,
      }),
      traceMetadata: buildUiActionTraceMetadata({
        actionId: resolutionInput.frontendActionId,
        intentId: resolvedActionIntentId,
        source: "ui_action",
        precondition: "missing_selected_marks",
      }),
    });
  }

  return createResolvedIntentResolution({
    agentRunId: resolutionInput.agentRunId,
    resolvedIntentId: resolvedActionIntentId,
    confidence:
      resolvedActionIntentId === "selected_mark_explanation" ? 0.99 : 0.95,
    source: "ui_action",
    reason: `UI action '${resolutionInput.frontendActionId}' resolved to '${resolvedActionIntentId}'.`,
    evidence: buildCommonEvidence({
      input: resolutionInput,
      actionId: resolutionInput.frontendActionId,
      hasSelectedMarks: input.hasSelectedMarks,
      selectedMarkCount: input.selectedMarkCount,
    }),
    traceMetadata: buildUiActionTraceMetadata({
      actionId: resolutionInput.frontendActionId,
      intentId: resolvedActionIntentId,
      source: "ui_action",
    }),
  });
}

function resolveDeterministicIntent(input: {
  input: IntentResolutionInput;
  availableIntentIds: Set<IntentId>;
  hasSelectedMarks: boolean;
  selectedMarkCount: number;
}): IntentResolutionResult | undefined {
  const { input: resolutionInput, availableIntentIds } = input;
  const message = resolutionInput.message?.toLowerCase() ?? "";
  const mentionsSelectedMarks = SELECTED_MARK_KEYWORDS.some((keyword) =>
    message.includes(keyword.toLowerCase()),
  );

  if (!mentionsSelectedMarks) {
    const metadataDiscoveryResolution = resolveMetadataDiscoveryIntent({
      input: resolutionInput,
      availableIntentIds,
    });
    if (metadataDiscoveryResolution) {
      return metadataDiscoveryResolution;
    }

    return undefined;
  }

  if (!availableIntentIds.has("selected_mark_explanation")) {
    return createUnresolvedIntentResolution({
      agentRunId: resolutionInput.agentRunId,
      fallbackIntentId: "unknown",
      confidence: 0,
      source: "deterministic_rule",
      reason:
        "The message mentions selected marks, but the intent is not available in this resolver scope.",
      warnings: ["selected_mark_explanation_unavailable"],
      evidence: buildCommonEvidence({
        input: resolutionInput,
        hasSelectedMarks: input.hasSelectedMarks,
        selectedMarkCount: input.selectedMarkCount,
        message: resolutionInput.message,
      }),
      traceMetadata: {
        source: "deterministic_rule",
        rule: "selected_mark_keywords",
      },
    });
  }

  if (!input.hasSelectedMarks || input.selectedMarkCount <= 0) {
    return createFallbackIntentResolution({
      agentRunId: resolutionInput.agentRunId,
      fallbackIntentId: "selected_mark_explanation",
      confidence: 0.25,
      source: "deterministic_rule",
      reason:
        "The message suggests a selected-mark explanation, but no selected marks are available.",
      warnings: ["missing_selected_marks"],
      evidence: buildCommonEvidence({
        input: resolutionInput,
        hasSelectedMarks: input.hasSelectedMarks,
        selectedMarkCount: input.selectedMarkCount,
        message: resolutionInput.message,
      }),
      traceMetadata: {
        source: "deterministic_rule",
        rule: "selected_mark_keywords",
        precondition: "missing_selected_marks",
      },
    });
  }

  return createResolvedIntentResolution({
    agentRunId: resolutionInput.agentRunId,
    resolvedIntentId: "selected_mark_explanation",
    confidence: 0.8,
    source: "deterministic_rule",
    reason:
      "The message and selected marks indicate a selected-mark explanation request.",
    evidence: buildCommonEvidence({
      input: resolutionInput,
      hasSelectedMarks: input.hasSelectedMarks,
      selectedMarkCount: input.selectedMarkCount,
      message: resolutionInput.message,
    }),
    traceMetadata: {
      source: "deterministic_rule",
      rule: "selected_mark_keywords",
    },
  });
}

function buildCommonEvidence(input: {
  input: IntentResolutionInput;
  requestedIntentId?: IntentId | string;
  actionId?: string;
  message?: string;
  hasSelectedMarks?: boolean;
  selectedMarkCount?: number;
}): ReturnType<typeof createIntentEvidence>[] {
  const evidence = [createIntentEvidence("agentRunId", input.input.agentRunId)];

  if (input.requestedIntentId) {
    evidence.push(
      createIntentEvidence("requestedIntentId", input.requestedIntentId),
    );
  }
  if (input.actionId) {
    evidence.push(createIntentEvidence("frontendActionId", input.actionId));
  }
  if (typeof input.message === "string" && input.message.trim().length > 0) {
    evidence.push(createIntentEvidence("message", input.message));
  }
  if (typeof input.hasSelectedMarks === "boolean") {
    evidence.push(
      createIntentEvidence("hasSelectedMarks", String(input.hasSelectedMarks)),
    );
  }
  if (typeof input.selectedMarkCount === "number") {
    evidence.push(
      createIntentEvidence(
        "selectedMarkCount",
        String(input.selectedMarkCount),
      ),
    );
  }
  if (input.input.contextSummary?.worksheetNames?.length) {
    evidence.push(
      createIntentEvidence(
        "worksheetNames",
        input.input.contextSummary.worksheetNames.join(", "),
      ),
    );
  }

  return evidence;
}

function resolveMetadataDiscoveryIntent(input: {
  input: IntentResolutionInput;
  availableIntentIds: Set<IntentId>;
}): IntentResolutionResult | undefined {
  const classification = classifyMetadataDiscoveryIntent({
    agentRunId: input.input.agentRunId,
    message: input.input.message,
    contextSummary: input.input.contextSummary,
    targetContext: input.input.targetContext,
    metadata: input.input.metadata,
  });
  const clarificationResponse =
    buildMetadataDiscoveryClarificationResponse(classification);
  const clarificationResponseMetadata = clarificationResponse
    ? buildMetadataDiscoveryClarificationTraceMetadata(clarificationResponse)
    : undefined;

  if (
    classification.kind === "fallback" &&
    classification.targetTypeCandidate === "unknown"
  ) {
    return undefined;
  }

  if (!input.availableIntentIds.has("metadata_discovery")) {
    return createUnresolvedIntentResolution({
      agentRunId: input.input.agentRunId,
      fallbackIntentId: "unknown",
      confidence: classification.confidence,
      source: "deterministic_rule",
      reason: "metadata_discovery is not available in this resolver scope.",
      warnings: ["metadata_discovery_unavailable"],
      evidence: buildCommonEvidence({
        input: input.input,
        message: input.input.message,
      }),
      traceMetadata: buildMetadataDiscoveryIntentTraceMetadata(classification),
      metadata: clarificationResponseMetadata
        ? {
            metadataDiscoveryClarificationResponse:
              clarificationResponseMetadata,
            metadataDiscoveryClarificationTraceMetadata:
              clarificationResponseMetadata,
          }
        : undefined,
    });
  }

  if (classification.kind === "execute_candidate") {
    return createResolvedIntentResolution({
      agentRunId: input.input.agentRunId,
      resolvedIntentId: "metadata_discovery",
      confidence: classification.confidence,
      source: "deterministic_rule",
      reason: classification.reasonBrief,
      evidence: buildCommonEvidence({
        input: input.input,
        message: input.input.message,
      }),
      traceMetadata: buildMetadataDiscoveryIntentTraceMetadata(classification),
      metadata: clarificationResponseMetadata
        ? {
            metadataDiscoveryClarificationResponse:
              clarificationResponseMetadata,
            metadataDiscoveryClarificationTraceMetadata:
              clarificationResponseMetadata,
          }
        : undefined,
    });
  }

  if (classification.kind === "clarification_candidate") {
    return createUnresolvedIntentResolution({
      agentRunId: input.input.agentRunId,
      fallbackIntentId: "unknown",
      confidence: classification.confidence,
      source: "deterministic_rule",
      reason: classification.reasonBrief,
      warnings: ["metadata_discovery_needs_clarification"],
      evidence: buildCommonEvidence({
        input: input.input,
        message: input.input.message,
      }),
      traceMetadata: buildMetadataDiscoveryIntentTraceMetadata(classification),
      metadata: clarificationResponseMetadata
        ? {
            metadataDiscoveryClarificationResponse:
              clarificationResponseMetadata,
            metadataDiscoveryClarificationTraceMetadata:
              clarificationResponseMetadata,
          }
        : undefined,
    });
  }

  return createFallbackIntentResolution({
    agentRunId: input.input.agentRunId,
    fallbackIntentId: "unknown",
    confidence: classification.confidence,
    source: "deterministic_rule",
    reason: classification.reasonBrief,
    warnings: ["metadata_discovery_legacy_fallback"],
    evidence: buildCommonEvidence({
      input: input.input,
      message: input.input.message,
    }),
    traceMetadata: buildMetadataDiscoveryIntentTraceMetadata(classification),
    metadata: {
      metadataDiscoveryDecision:
        buildMetadataDiscoveryIntentTraceMetadata(classification),
    },
  });
}

function buildUiActionTraceMetadata(input: {
  actionId?: string;
  intentId?: IntentId;
  source: "ui_action";
  precondition?: string;
}): JsonObject {
  const metadata: JsonObject = {
    source: input.source,
  };

  if (input.actionId) {
    metadata.actionId = input.actionId;
  }
  if (input.intentId) {
    metadata.intentId = input.intentId;
  }
  if (input.precondition) {
    metadata.precondition = input.precondition;
  }

  return metadata;
}

function resolveActionIntentId(
  actionId: string | undefined,
  actionMap: Map<string, IntentId>,
): IntentId | undefined {
  if (!actionId) {
    return undefined;
  }

  return actionMap.get(actionId);
}

function normalizeActionMap(
  actionMap: ReadonlyMap<string, IntentId> | Record<string, IntentId>,
): Map<string, IntentId> {
  if (actionMap instanceof Map) {
    return new Map(actionMap);
  }

  return new Map(
    Object.entries(actionMap).filter(([, intentId]) =>
      isKnownIntentId(intentId),
    ),
  );
}

function normalizeIntentId(value: unknown): IntentId | undefined {
  return isKnownIntentId(value) ? value : undefined;
}

function isKnownIntentId(value: unknown): value is IntentId {
  return (
    value === "selected_mark_explanation" ||
    value === "current_dashboard_summary" ||
    value === "metadata_discovery" ||
    value === "freeform_question" ||
    value === "unknown"
  );
}

function hasSelectedMarksSummary(
  selectedMarks?: IntentResolutionSelectedMarksSummary,
): boolean {
  if (!selectedMarks) {
    return false;
  }

  if (selectedMarks.hasSelectedMarks === true) {
    return true;
  }

  return (selectedMarks.totalCount ?? 0) > 0;
}
