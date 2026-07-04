import type { AgentRunId } from "./runId";
import type { IntentResolutionContextSummary } from "./intent";
import type { JsonObject } from "./types";

export type MetadataDiscoveryIntentId = "metadata_discovery";

export type MetadataDiscoveryTargetType =
  | "datasource"
  | "workbook"
  | "view"
  | "unknown";

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

export type MetadataDiscoveryEvidence = {
  type: string;
  value: string;
};

export type MetadataDiscoveryIntentInput = {
  agentRunId: AgentRunId;
  message?: string;
  contextSummary?: IntentResolutionContextSummary;
  requestedTargetType?: MetadataDiscoveryTargetType;
  metadata?: JsonObject;
};

export type MetadataDiscoveryIntentDecision = {
  agentRunId: AgentRunId;
  intentId: MetadataDiscoveryIntentId;
  kind: MetadataDiscoveryDecisionKind;
  confidence: number;
  targetTypeCandidate: MetadataDiscoveryTargetType;
  clarificationRequired: boolean;
  unsupportedReason?: string;
  nextStep: MetadataDiscoveryNextStep;
  reasonBrief: string;
  safeUserFacingNote: string;
  signals: string[];
  evidence: MetadataDiscoveryEvidence[];
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

export function classifyMetadataDiscoveryIntent(
  input: MetadataDiscoveryIntentInput,
): MetadataDiscoveryIntentDecision {
  const normalizedMessage = normalizeMessage(input.message);
  const evidence = buildEvidence(input, normalizedMessage);
  const targetTypeCandidate =
    input.requestedTargetType ?? detectTargetType(normalizedMessage);
  const discoverySignals = buildDiscoverySignals(normalizedMessage);
  const unsafeSignals = buildUnsafeSignals(normalizedMessage);
  const querySignals = buildQuerySignals(normalizedMessage);
  const hasDiscoverySignal = discoverySignals.length > 0;
  const hasUnsafeSignal = unsafeSignals.length > 0;
  const hasQuerySignal = querySignals.length > 0;
  const multipleTargetTypes = hasMultipleTargetTypes(normalizedMessage);

  if (hasUnsafeSignal || hasQuerySignal) {
    return {
      agentRunId: input.agentRunId,
      intentId: "metadata_discovery",
      kind: "unsupported",
      confidence: 0.15,
      targetTypeCandidate,
      clarificationRequired: false,
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
      metadata: cloneJsonObject(input.metadata),
      traceMetadata: {
        kind: "unsupported",
        targetTypeCandidate,
        signals: [...discoverySignals, ...unsafeSignals, ...querySignals],
      },
    };
  }

  if (!hasDiscoverySignal && targetTypeCandidate === "unknown") {
    return {
      agentRunId: input.agentRunId,
      intentId: "metadata_discovery",
      kind: "fallback",
      confidence: 0.05,
      targetTypeCandidate: "unknown",
      clarificationRequired: false,
      nextStep: "legacy_fallback",
      reasonBrief:
        "The request does not look like a metadata discovery request.",
      safeUserFacingNote:
        "This does not look like metadata discovery yet, so it should stay on the legacy path.",
      signals: [],
      evidence,
      metadata: cloneJsonObject(input.metadata),
      traceMetadata: {
        kind: "fallback",
        targetTypeCandidate: "unknown",
      },
    };
  }

  if (
    targetTypeCandidate === "unknown" ||
    multipleTargetTypes ||
    looksAmbiguous(normalizedMessage)
  ) {
    return {
      agentRunId: input.agentRunId,
      intentId: "metadata_discovery",
      kind: "clarification_candidate",
      confidence: 0.7,
      targetTypeCandidate,
      clarificationRequired: true,
      nextStep: "clarify",
      reasonBrief:
        "The request looks like metadata discovery, but the target is ambiguous.",
      safeUserFacingNote:
        "I can help with datasource, workbook, or view metadata, but I need one clear target first.",
      signals: [...discoverySignals],
      evidence,
      metadata: cloneJsonObject(input.metadata),
      traceMetadata: {
        kind: "clarification_candidate",
        targetTypeCandidate,
        signals: [...discoverySignals],
      },
    };
  }

  return {
    agentRunId: input.agentRunId,
    intentId: "metadata_discovery",
    kind: "execute_candidate",
    confidence: 0.86,
    targetTypeCandidate,
    clarificationRequired: false,
    nextStep: "structured_plan",
    reasonBrief:
      "The request looks like a safe metadata discovery case that can move to structured orchestration.",
    safeUserFacingNote:
      "This looks like structured metadata discovery and can continue through the safe orchestration path.",
    signals: [...discoverySignals],
    evidence,
    metadata: cloneJsonObject(input.metadata),
    traceMetadata: {
      kind: "execute_candidate",
      targetTypeCandidate,
      signals: [...discoverySignals],
    },
  };
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
    clarificationRequired: decision.clarificationRequired,
    nextStep: decision.nextStep,
    reasonBrief: decision.reasonBrief,
    safeUserFacingNote: decision.safeUserFacingNote,
    signals: [...decision.signals],
  };

  if (decision.unsupportedReason) {
    metadata.unsupportedReason = decision.unsupportedReason;
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
  const targetSignals = targetTypeMatches(normalizedMessage).map(
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

function detectTargetType(
  normalizedMessage: string,
): MetadataDiscoveryTargetType {
  const matches = targetTypeMatches(normalizedMessage);
  if (matches.length === 1) {
    return matches[0];
  }
  return "unknown";
}

function hasMultipleTargetTypes(normalizedMessage: string): boolean {
  return targetTypeMatches(normalizedMessage).length > 1;
}

function targetTypeMatches(
  normalizedMessage: string,
): MetadataDiscoveryTargetType[] {
  const matches: MetadataDiscoveryTargetType[] = [];
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
