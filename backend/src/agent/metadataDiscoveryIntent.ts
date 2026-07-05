import type { AgentRunId } from "./runId";
import type { IntentResolutionContextSummary } from "./intent";
import type { JsonObject } from "./types";

export type MetadataDiscoveryIntentId = "metadata_discovery";

export type MetadataDiscoveryTargetType =
  | "datasource"
  | "workbook"
  | "view"
  | "unknown";

export type MetadataDiscoveryAmbiguityState =
  | "ready"
  | "unknown_target"
  | "ambiguous_target"
  | "missing_identifier"
  | "target_not_supported"
  | "unsupported";

export type MetadataDiscoveryDecisionKind =
  | "execute_candidate"
  | "clarification_candidate"
  | "fallback"
  | "unsupported";

export type MetadataDiscoveryNextStep =
  | "structured_plan"
  | "clarify"
  | "legacy_fallback"
  | "unsupported";

export type MetadataDiscoveryPreconditionId =
  | "target_type_known"
  | "single_target_candidate"
  | "datasource_identifier_present"
  | "datasource_boundary_supported";

export type MetadataDiscoveryPreconditionCheck = {
  id: MetadataDiscoveryPreconditionId;
  required: boolean;
  satisfied: boolean;
  reasonBrief: string;
  metadata?: JsonObject;
};

export type MetadataDiscoveryEvidence = {
  type: string;
  value: string;
};

export type MetadataDiscoveryTargetContext = {
  targetType?: MetadataDiscoveryTargetType;
  identifier?: string;
  identifierType?: string;
  candidateTargetTypes?: readonly Exclude<
    MetadataDiscoveryTargetType,
    "unknown"
  >[];
  candidateCount?: number;
  source?: string;
  metadata?: JsonObject;
};

export type MetadataDiscoveryIntentInput = {
  agentRunId: AgentRunId;
  message?: string;
  contextSummary?: IntentResolutionContextSummary;
  requestedTargetType?: MetadataDiscoveryTargetType;
  targetContext?: MetadataDiscoveryTargetContext;
  metadata?: JsonObject;
};

export type MetadataDiscoveryIntentDecision = {
  agentRunId: AgentRunId;
  intentId: MetadataDiscoveryIntentId;
  kind: MetadataDiscoveryDecisionKind;
  confidence: number;
  targetTypeCandidate: MetadataDiscoveryTargetType;
  candidateTargetTypes: readonly Exclude<
    MetadataDiscoveryTargetType,
    "unknown"
  >[];
  ambiguityState: MetadataDiscoveryAmbiguityState;
  clarificationRequired: boolean;
  metadataBoundaryReady: boolean;
  unsupportedReason?: string;
  clarificationReason?: string;
  nextStep: MetadataDiscoveryNextStep;
  reasonBrief: string;
  safeUserFacingNote: string;
  signals: string[];
  evidence: MetadataDiscoveryEvidence[];
  preconditions: readonly MetadataDiscoveryPreconditionCheck[];
  missingPreconditions: readonly MetadataDiscoveryPreconditionId[];
  metadata?: JsonObject;
  traceMetadata?: JsonObject;
};

const METADATA_DISCOVERY_KEYWORDS = [
  "metadata",
  "metadata discovery",
  "describe",
  "description",
  "schema",
  "structure",
  "about this datasource",
  "about this workbook",
  "about this view",
] as const;

const METADATA_DISCOVERY_TARGET_KEYWORDS: Record<
  Exclude<MetadataDiscoveryTargetType, "unknown">,
  readonly string[]
> = {
  datasource: ["datasource", "data source"],
  workbook: ["workbook"],
  view: ["view"],
};

const METADATA_DISCOVERY_UNSAFE_KEYWORDS = [
  "row data",
  "field values",
  "values",
  "aggregate",
  "aggregation",
  "query",
  "sql",
  "write",
  "update",
  "insert",
  "delete",
  "mcp tool",
  "raw mcp",
  "underlying data",
] as const;

const METADATA_DISCOVERY_QUERY_INTENT_KEYWORDS = [
  "query",
  "sql",
  "aggregate",
  "aggregation",
  "analysis",
  "calculate",
  "calculation",
  "row data",
  "field values",
  "underlying data",
] as const;

const METADATA_DISCOVERY_SAFE_TARGETS = new Set<MetadataDiscoveryTargetType>([
  "datasource",
  "workbook",
  "view",
]);

export function classifyMetadataDiscoveryIntent(
  input: MetadataDiscoveryIntentInput,
): MetadataDiscoveryIntentDecision {
  const normalizedMessage = normalizeMessage(input.message);
  const evidence = buildEvidence(input, normalizedMessage);
  const discoverySignals = buildDiscoverySignals(normalizedMessage);
  const unsafeSignals = buildUnsafeSignals(normalizedMessage);
  const querySignals = buildQuerySignals(normalizedMessage);
  const targetContext = resolveTargetContext(input, normalizedMessage);
  const targetTypeCandidate = targetContext.targetType;
  const candidateTargetTypes = targetContext.candidateTargetTypes;
  const hasDiscoverySignal =
    discoverySignals.length > 0 || candidateTargetTypes.length > 0;
  const hasUnsafeSignal = unsafeSignals.length > 0;
  const hasQuerySignal = querySignals.length > 0;
  const multipleTargetTypes =
    candidateTargetTypes.length > 1 ||
    (targetContext.candidateCount ?? 0) > 1 ||
    looksAmbiguous(normalizedMessage);
  const identifierPresent = Boolean(targetContext.identifier?.trim());

  if (hasUnsafeSignal || hasQuerySignal) {
    const preconditions = buildPreconditions({
      targetTypeCandidate,
      candidateTargetTypes,
      identifierPresent,
      metadataBoundaryReady: false,
      ambiguityState: "unsupported",
    });

    return buildDecision({
      input,
      kind: "unsupported",
      confidence: 0.15,
      targetTypeCandidate,
      candidateTargetTypes,
      ambiguityState: "unsupported",
      clarificationRequired: false,
      metadataBoundaryReady: false,
      unsupportedReason: hasQuerySignal
        ? "The request asks for query-style execution or data retrieval."
        : "The request asks for unsafe metadata access.",
      nextStep: "legacy_fallback",
      reasonBrief:
        "The request should stay on the legacy fallback path because it asks for data access or query execution.",
      safeUserFacingNote:
        "I can help with safe metadata discovery, but this request needs a legacy fallback path.",
      signals: [...discoverySignals, ...unsafeSignals, ...querySignals],
      evidence,
      preconditions,
      metadata: cloneJsonObject(input.metadata),
      traceMetadata: {
        kind: "unsupported",
        targetTypeCandidate,
        candidateTargetTypes: [...candidateTargetTypes],
        signals: [...discoverySignals, ...unsafeSignals, ...querySignals],
      },
    });
  }

  if (!hasDiscoverySignal && targetTypeCandidate === "unknown") {
    const preconditions = buildPreconditions({
      targetTypeCandidate,
      candidateTargetTypes,
      identifierPresent,
      metadataBoundaryReady: false,
      ambiguityState: "unknown_target",
    });

    return buildDecision({
      input,
      kind: "fallback",
      confidence: 0.05,
      targetTypeCandidate,
      candidateTargetTypes,
      ambiguityState: "unknown_target",
      clarificationRequired: false,
      metadataBoundaryReady: false,
      nextStep: "legacy_fallback",
      reasonBrief:
        "The request does not look like a metadata discovery request.",
      safeUserFacingNote:
        "This does not look like metadata discovery yet, so it should stay on the legacy path.",
      signals: [],
      evidence,
      preconditions,
      metadata: cloneJsonObject(input.metadata),
      traceMetadata: {
        kind: "fallback",
        targetTypeCandidate: "unknown",
        candidateTargetTypes: [...candidateTargetTypes],
      },
    });
  }

  if (multipleTargetTypes) {
    const preconditions = buildPreconditions({
      targetTypeCandidate,
      candidateTargetTypes,
      identifierPresent,
      metadataBoundaryReady: false,
      ambiguityState: "ambiguous_target",
    });

    return buildDecision({
      input,
      kind: "clarification_candidate",
      confidence: 0.72,
      targetTypeCandidate,
      candidateTargetTypes,
      ambiguityState: "ambiguous_target",
      clarificationRequired: true,
      metadataBoundaryReady: false,
      clarificationReason:
        "The request can be read as more than one Tableau content type.",
      nextStep: "clarify",
      reasonBrief:
        "The request looks like metadata discovery, but the target is ambiguous.",
      safeUserFacingNote:
        "I can help with datasource, workbook, or view metadata, but I need one clear target first.",
      signals: [...discoverySignals],
      evidence,
      preconditions,
      missingPreconditions: [
        "single_target_candidate",
        ...(targetTypeCandidate === "datasource"
          ? ["datasource_identifier_present" as const]
          : []),
      ],
      metadata: cloneJsonObject(input.metadata),
      traceMetadata: {
        kind: "clarification_candidate",
        targetTypeCandidate,
        candidateTargetTypes: [...candidateTargetTypes],
        signals: [...discoverySignals],
      },
    });
  }

  if (targetTypeCandidate === "unknown") {
    const preconditions = buildPreconditions({
      targetTypeCandidate,
      candidateTargetTypes,
      identifierPresent,
      metadataBoundaryReady: false,
      ambiguityState: "unknown_target",
    });

    return buildDecision({
      input,
      kind: "clarification_candidate",
      confidence: 0.67,
      targetTypeCandidate,
      candidateTargetTypes,
      ambiguityState: "unknown_target",
      clarificationRequired: true,
      metadataBoundaryReady: false,
      clarificationReason:
        "The request looks like metadata discovery, but the target type is not clear.",
      nextStep: "clarify",
      reasonBrief:
        "The request looks like metadata discovery, but the target type is unknown.",
      safeUserFacingNote:
        "I can help with datasource, workbook, or view metadata, but I need to know which one you mean.",
      signals: [...discoverySignals],
      evidence,
      preconditions,
      missingPreconditions: ["target_type_known"],
      metadata: cloneJsonObject(input.metadata),
      traceMetadata: {
        kind: "clarification_candidate",
        targetTypeCandidate: "unknown",
        candidateTargetTypes: [...candidateTargetTypes],
        signals: [...discoverySignals],
      },
    });
  }

  if (targetTypeCandidate !== "datasource") {
    const preconditions = buildPreconditions({
      targetTypeCandidate,
      candidateTargetTypes,
      identifierPresent,
      metadataBoundaryReady: false,
      ambiguityState: "target_not_supported",
    });

    return buildDecision({
      input,
      kind: "clarification_candidate",
      confidence: 0.66,
      targetTypeCandidate,
      candidateTargetTypes,
      ambiguityState: "target_not_supported",
      clarificationRequired: true,
      metadataBoundaryReady: false,
      clarificationReason:
        "The current structured boundary only executes safe datasource metadata cases.",
      nextStep: "clarify",
      reasonBrief:
        "The request looks like metadata discovery, but workbook and view targets stay on the clarification path here.",
      safeUserFacingNote:
        "I can help with datasource metadata in this step, but workbook or view targets need clarification first.",
      signals: [...discoverySignals],
      evidence,
      preconditions,
      missingPreconditions: ["datasource_boundary_supported"],
      metadata: cloneJsonObject(input.metadata),
      traceMetadata: {
        kind: "clarification_candidate",
        targetTypeCandidate,
        candidateTargetTypes: [...candidateTargetTypes],
        signals: [...discoverySignals],
      },
    });
  }

  if (!identifierPresent) {
    const preconditions = buildPreconditions({
      targetTypeCandidate,
      candidateTargetTypes,
      identifierPresent,
      metadataBoundaryReady: false,
      ambiguityState: "missing_identifier",
    });

    return buildDecision({
      input,
      kind: "clarification_candidate",
      confidence: 0.76,
      targetTypeCandidate,
      candidateTargetTypes,
      ambiguityState: "missing_identifier",
      clarificationRequired: true,
      metadataBoundaryReady: false,
      clarificationReason:
        "The datasource target is clear, but the identifier needed for safe execution is missing.",
      nextStep: "clarify",
      reasonBrief:
        "The request looks like metadata discovery, but the datasource identifier is missing.",
      safeUserFacingNote:
        "I can continue with datasource metadata once I know which datasource you mean.",
      signals: [...discoverySignals],
      evidence,
      preconditions,
      missingPreconditions: ["datasource_identifier_present"],
      metadata: cloneJsonObject(input.metadata),
      traceMetadata: {
        kind: "clarification_candidate",
        targetTypeCandidate,
        candidateTargetTypes: [...candidateTargetTypes],
        signals: [...discoverySignals],
      },
    });
  }

  const preconditions = buildPreconditions({
    targetTypeCandidate,
    candidateTargetTypes,
    identifierPresent,
    metadataBoundaryReady: true,
    ambiguityState: "ready",
  });

  return buildDecision({
    input,
    kind: "execute_candidate",
    confidence: 0.9,
    targetTypeCandidate,
    candidateTargetTypes,
    ambiguityState: "ready",
    clarificationRequired: false,
    metadataBoundaryReady: true,
    nextStep: "structured_plan",
    reasonBrief:
      "The request looks like a safe datasource metadata discovery case that can move to structured orchestration.",
    safeUserFacingNote:
      "This looks like structured metadata discovery and can continue through the safe orchestration path.",
    signals: [...discoverySignals],
    evidence,
    preconditions,
    missingPreconditions: [],
    metadata: cloneJsonObject(input.metadata),
    traceMetadata: {
      kind: "execute_candidate",
      targetTypeCandidate,
      candidateTargetTypes: [...candidateTargetTypes],
      signals: [...discoverySignals],
    },
  });
}

export function buildMetadataDiscoveryIntentTraceMetadata(
  decision: MetadataDiscoveryIntentDecision,
): JsonObject {
  const metadata: JsonObject = {
    agentRunId: decision.agentRunId,
    intentId: decision.intentId,
    kind: decision.kind,
    confidence: decision.confidence,
    targetTypeCandidate: decision.targetTypeCandidate,
    candidateTargetTypes: [...decision.candidateTargetTypes],
    ambiguityState: decision.ambiguityState,
    clarificationRequired: decision.clarificationRequired,
    metadataBoundaryReady: decision.metadataBoundaryReady,
    nextStep: decision.nextStep,
    reasonBrief: decision.reasonBrief,
    safeUserFacingNote: decision.safeUserFacingNote,
    signals: [...decision.signals],
    preconditions: decision.preconditions.map((item) => ({
      id: item.id,
      required: item.required,
      satisfied: item.satisfied,
      reasonBrief: item.reasonBrief,
      ...(item.metadata ? { metadata: { ...item.metadata } } : {}),
    })),
    missingPreconditions: [...decision.missingPreconditions],
  };

  if (decision.unsupportedReason) {
    metadata.unsupportedReason = decision.unsupportedReason;
  }
  if (decision.clarificationReason) {
    metadata.clarificationReason = decision.clarificationReason;
  }
  if (decision.metadata) {
    metadata.metadata = { ...decision.metadata };
  }
  if (decision.traceMetadata) {
    metadata.traceMetadata = { ...decision.traceMetadata };
  }
  if (decision.evidence.length > 0) {
    metadata.evidence = decision.evidence.map((item) => ({ ...item }));
  }

  return metadata;
}

function buildDecision(input: {
  input: MetadataDiscoveryIntentInput;
  kind: MetadataDiscoveryDecisionKind;
  confidence: number;
  targetTypeCandidate: MetadataDiscoveryTargetType;
  candidateTargetTypes: readonly Exclude<
    MetadataDiscoveryTargetType,
    "unknown"
  >[];
  ambiguityState: MetadataDiscoveryAmbiguityState;
  clarificationRequired: boolean;
  metadataBoundaryReady: boolean;
  unsupportedReason?: string;
  clarificationReason?: string;
  nextStep: MetadataDiscoveryNextStep;
  reasonBrief: string;
  safeUserFacingNote: string;
  signals: string[];
  evidence: MetadataDiscoveryEvidence[];
  preconditions: readonly MetadataDiscoveryPreconditionCheck[];
  missingPreconditions?: readonly MetadataDiscoveryPreconditionId[];
  metadata?: JsonObject;
  traceMetadata?: JsonObject;
}): MetadataDiscoveryIntentDecision {
  return {
    agentRunId: input.input.agentRunId,
    intentId: "metadata_discovery",
    kind: input.kind,
    confidence: input.confidence,
    targetTypeCandidate: input.targetTypeCandidate,
    candidateTargetTypes: [...input.candidateTargetTypes],
    ambiguityState: input.ambiguityState,
    clarificationRequired: input.clarificationRequired,
    metadataBoundaryReady: input.metadataBoundaryReady,
    unsupportedReason: input.unsupportedReason,
    clarificationReason: input.clarificationReason,
    nextStep: input.nextStep,
    reasonBrief: input.reasonBrief,
    safeUserFacingNote: input.safeUserFacingNote,
    signals: [...input.signals],
    evidence: input.evidence.map((item) => ({ ...item })),
    preconditions: input.preconditions.map((item) => ({
      id: item.id,
      required: item.required,
      satisfied: item.satisfied,
      reasonBrief: item.reasonBrief,
      ...(item.metadata ? { metadata: { ...item.metadata } } : {}),
    })),
    missingPreconditions: [...(input.missingPreconditions ?? [])],
    metadata: cloneJsonObject(input.metadata),
    traceMetadata: input.traceMetadata ? { ...input.traceMetadata } : undefined,
  };
}

function buildPreconditions(input: {
  targetTypeCandidate: MetadataDiscoveryTargetType;
  candidateTargetTypes: readonly Exclude<
    MetadataDiscoveryTargetType,
    "unknown"
  >[];
  identifierPresent: boolean;
  metadataBoundaryReady: boolean;
  ambiguityState: MetadataDiscoveryAmbiguityState;
}): readonly MetadataDiscoveryPreconditionCheck[] {
  const targetTypeKnown = input.targetTypeCandidate !== "unknown";
  const singleTargetCandidate = input.candidateTargetTypes.length === 1;
  const datasourceIdentifierPresent =
    input.targetTypeCandidate === "datasource" && input.identifierPresent;
  const datasourceBoundarySupported =
    input.metadataBoundaryReady &&
    input.ambiguityState === "ready" &&
    input.targetTypeCandidate === "datasource";

  return [
    {
      id: "target_type_known",
      required: true,
      satisfied: targetTypeKnown,
      reasonBrief: targetTypeKnown
        ? "The target type is known."
        : "The target type is not known yet.",
    },
    {
      id: "single_target_candidate",
      required: true,
      satisfied: singleTargetCandidate,
      reasonBrief: singleTargetCandidate
        ? "Only one target candidate remains."
        : "Multiple target candidates are still present.",
    },
    {
      id: "datasource_identifier_present",
      required: true,
      satisfied: datasourceIdentifierPresent,
      reasonBrief: datasourceIdentifierPresent
        ? "A datasource identifier is available."
        : "A datasource identifier is missing or not applicable yet.",
    },
    {
      id: "datasource_boundary_supported",
      required: true,
      satisfied: datasourceBoundarySupported,
      reasonBrief: datasourceBoundarySupported
        ? "The datasource boundary is ready for structured orchestration."
        : "The request is not yet ready for the datasource boundary.",
    },
  ];
}

function resolveTargetContext(
  input: MetadataDiscoveryIntentInput,
  normalizedMessage: string,
): {
  targetType: MetadataDiscoveryTargetType;
  candidateTargetTypes: readonly Exclude<
    MetadataDiscoveryTargetType,
    "unknown"
  >[];
  identifier?: string;
  identifierType?: string;
  candidateCount?: number;
  source?: string;
  metadata?: JsonObject;
} {
  const requestedTargetType = isMetadataDiscoveryTargetType(
    input.requestedTargetType,
  )
    ? input.requestedTargetType
    : undefined;
  const explicitTargetType = isMetadataDiscoveryTargetType(
    input.targetContext?.targetType,
  )
    ? input.targetContext?.targetType
    : undefined;
  const targetType =
    explicitTargetType ??
    requestedTargetType ??
    detectTargetType(normalizedMessage);
  const candidateTargetTypes =
    normalizeCandidateTargetTypes(input.targetContext?.candidateTargetTypes) ??
    (targetType === "unknown"
      ? detectCandidateTargetTypes(normalizedMessage)
      : [targetType]);

  return {
    targetType,
    candidateTargetTypes,
    identifier: input.targetContext?.identifier?.trim(),
    identifierType: input.targetContext?.identifierType,
    candidateCount: input.targetContext?.candidateCount,
    source: input.targetContext?.source,
    metadata: cloneJsonObject(input.targetContext?.metadata),
  };
}

function normalizeCandidateTargetTypes(
  value?: readonly Exclude<MetadataDiscoveryTargetType, "unknown">[],
): readonly Exclude<MetadataDiscoveryTargetType, "unknown">[] | undefined {
  if (!value || value.length === 0) {
    return undefined;
  }

  const normalized = value.filter(
    (targetType, index, array) =>
      isSafeTargetType(targetType) && array.indexOf(targetType) === index,
  );

  return normalized.length > 0 ? normalized : undefined;
}

function detectTargetType(
  normalizedMessage: string,
): MetadataDiscoveryTargetType {
  const matches = detectCandidateTargetTypes(normalizedMessage);
  if (matches.length === 1) {
    return matches[0];
  }
  if (matches.length > 1) {
    return "unknown";
  }
  return "unknown";
}

function detectCandidateTargetTypes(
  normalizedMessage: string,
): readonly Exclude<MetadataDiscoveryTargetType, "unknown">[] {
  const matches: Exclude<MetadataDiscoveryTargetType, "unknown">[] = [];
  for (const [targetType, keywords] of Object.entries(
    METADATA_DISCOVERY_TARGET_KEYWORDS,
  ) as Array<
    [Exclude<MetadataDiscoveryTargetType, "unknown">, readonly string[]]
  >) {
    if (
      keywords.some((keyword) => {
        const pattern = new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i");
        return pattern.test(normalizedMessage);
      })
    ) {
      matches.push(targetType);
    }
  }
  return matches;
}

function buildEvidence(
  input: MetadataDiscoveryIntentInput,
  normalizedMessage: string,
): MetadataDiscoveryEvidence[] {
  const evidence: MetadataDiscoveryEvidence[] = [
    { type: "agentRunId", value: input.agentRunId },
  ];

  if (normalizedMessage) {
    evidence.push({ type: "message", value: normalizedMessage });
  }
  if (input.requestedTargetType) {
    evidence.push({
      type: "requestedTargetType",
      value: input.requestedTargetType,
    });
  }
  if (input.targetContext?.targetType) {
    evidence.push({
      type: "targetContext.targetType",
      value: input.targetContext.targetType,
    });
  }
  if (input.targetContext?.candidateTargetTypes?.length) {
    evidence.push({
      type: "targetContext.candidateTargetTypes",
      value: input.targetContext.candidateTargetTypes.join(","),
    });
  }
  if (input.targetContext?.identifier) {
    evidence.push({
      type: "targetContext.identifier",
      value: input.targetContext.identifier,
    });
  }
  if (input.contextSummary?.workbookName) {
    evidence.push({
      type: "workbookName",
      value: input.contextSummary.workbookName,
    });
  }
  if (input.contextSummary?.viewName) {
    evidence.push({
      type: "viewName",
      value: input.contextSummary.viewName,
    });
  }
  if (input.contextSummary?.dashboardName) {
    evidence.push({
      type: "dashboardName",
      value: input.contextSummary.dashboardName,
    });
  }

  return evidence;
}

function buildDiscoverySignals(normalizedMessage: string): string[] {
  const keywordSignals = METADATA_DISCOVERY_KEYWORDS.filter((keyword) =>
    normalizedMessage.includes(keyword),
  ).map((keyword) => `metadata:${keyword}`);
  const targetSignals = detectCandidateTargetTypes(normalizedMessage).map(
    (targetType) => `target:${targetType}`,
  );
  return [...keywordSignals, ...targetSignals];
}

function buildUnsafeSignals(normalizedMessage: string): string[] {
  return METADATA_DISCOVERY_UNSAFE_KEYWORDS.filter((keyword) =>
    normalizedMessage.includes(keyword),
  ).map((keyword) => `unsafe:${keyword}`);
}

function buildQuerySignals(normalizedMessage: string): string[] {
  return METADATA_DISCOVERY_QUERY_INTENT_KEYWORDS.filter((keyword) =>
    normalizedMessage.includes(keyword),
  ).map((keyword) => `query:${keyword}`);
}

function looksAmbiguous(normalizedMessage: string): boolean {
  return (
    normalizedMessage.includes(" or ") ||
    normalizedMessage.includes("/") ||
    normalizedMessage.includes("either") ||
    normalizedMessage.includes("any of these")
  );
}

function normalizeMessage(message?: string): string {
  return message?.toLowerCase().trim().replace(/\s+/g, " ") ?? "";
}

function cloneJsonObject(value?: JsonObject): JsonObject | undefined {
  return value ? { ...value } : undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isMetadataDiscoveryTargetType(
  value: unknown,
): value is MetadataDiscoveryTargetType {
  return (
    value === "datasource" ||
    value === "workbook" ||
    value === "view" ||
    value === "unknown"
  );
}

function isSafeTargetType(
  value: MetadataDiscoveryTargetType,
): value is Exclude<MetadataDiscoveryTargetType, "unknown"> {
  return METADATA_DISCOVERY_SAFE_TARGETS.has(value);
}
