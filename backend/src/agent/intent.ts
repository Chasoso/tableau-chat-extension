import type { AgentRunId } from "./runId";
import type { JsonObject } from "./types";

export type IntentId =
  | "selected_mark_explanation"
  | "current_dashboard_summary"
  | "metadata_discovery"
  | "freeform_question"
  | "unknown";

export type IntentResolutionStatus = "resolved" | "unresolved" | "fallback";

export type IntentResolutionSource =
  | "ui_action"
  | "explicit"
  | "deterministic_rule"
  | "llm"
  | "fallback";

export type IntentResolverMode = "deterministic" | "hybrid" | "llm";

export type IntentResolutionEvidence = {
  type: string;
  value: string;
  metadata?: JsonObject;
};

export type IntentResolutionSelectedMarksSummary = {
  hasSelectedMarks?: boolean;
  totalCount?: number;
  previewCount?: number;
  truncated?: boolean;
  worksheetNames?: string[];
};

export type IntentResolutionContextSummary = {
  dashboardName?: string;
  workbookName?: string;
  viewName?: string;
  worksheetNames?: string[];
  selectedMarks?: IntentResolutionSelectedMarksSummary;
  summaryDataPreview?: {
    available?: boolean;
    rowCount?: number;
    columnCount?: number;
    columnNames?: string[];
    truncated?: boolean;
  };
  filters?: {
    count?: number;
    names?: string[];
  };
  parameters?: {
    count?: number;
    names?: string[];
  };
};

export type IntentResolutionContextPackRef = {
  agentRunId?: AgentRunId;
  contextPackId?: string;
  source?: string;
};

export type IntentResolutionInput = {
  agentRunId: AgentRunId;
  message?: string;
  frontendActionId?: string;
  requestedIntentId?: IntentId;
  contextPackRef?: IntentResolutionContextPackRef;
  contextSummary?: IntentResolutionContextSummary;
  availableIntentIds?: IntentId[];
  resolverMode?: IntentResolverMode;
  traceMetadata?: JsonObject;
  metadata?: JsonObject;
  targetContext?: JsonObject;
};

export type IntentResolutionResult = {
  agentRunId: AgentRunId;
  status: IntentResolutionStatus;
  resolvedIntentId: IntentId;
  confidence: number;
  source: IntentResolutionSource;
  reason?: string;
  evidence: IntentResolutionEvidence[];
  warnings: string[];
  fallbackIntentId?: IntentId;
  traceMetadata?: JsonObject;
  metadata?: JsonObject;
};

// Keep the contract async so future resolvers can query external configuration
// or LLM-backed classifiers without changing the interface again.
export interface IntentResolver {
  resolve(input: IntentResolutionInput): Promise<IntentResolutionResult>;
}

export function createIntentEvidence(
  type: string,
  value: string,
  metadata?: JsonObject,
): IntentResolutionEvidence {
  return metadata
    ? { type, value, metadata: { ...metadata } }
    : { type, value };
}

export function normalizeIntentConfidence(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

export function createResolvedIntentResolution(input: {
  agentRunId: AgentRunId;
  resolvedIntentId: IntentId;
  confidence?: number;
  source?: IntentResolutionSource;
  reason?: string;
  evidence?: IntentResolutionEvidence[];
  warnings?: string[];
  traceMetadata?: JsonObject;
  metadata?: JsonObject;
}): IntentResolutionResult {
  return {
    agentRunId: input.agentRunId,
    status: "resolved",
    resolvedIntentId: input.resolvedIntentId,
    confidence: normalizeIntentConfidence(input.confidence ?? 1),
    source: input.source ?? "deterministic_rule",
    reason: input.reason,
    evidence: cloneEvidence(input.evidence),
    warnings: cloneStrings(input.warnings),
    traceMetadata: cloneJsonObject(input.traceMetadata),
    metadata: cloneJsonObject(input.metadata),
  };
}

export function createUnresolvedIntentResolution(input: {
  agentRunId: AgentRunId;
  fallbackIntentId?: IntentId;
  confidence?: number;
  source?: IntentResolutionSource;
  reason?: string;
  evidence?: IntentResolutionEvidence[];
  warnings?: string[];
  traceMetadata?: JsonObject;
  metadata?: JsonObject;
}): IntentResolutionResult {
  return {
    agentRunId: input.agentRunId,
    status: "unresolved",
    resolvedIntentId: input.fallbackIntentId ?? "unknown",
    confidence: normalizeIntentConfidence(input.confidence ?? 0),
    source: input.source ?? "fallback",
    reason: input.reason,
    evidence: cloneEvidence(input.evidence),
    warnings: cloneStrings(input.warnings),
    fallbackIntentId: input.fallbackIntentId,
    traceMetadata: cloneJsonObject(input.traceMetadata),
    metadata: cloneJsonObject(input.metadata),
  };
}

export function createFallbackIntentResolution(input: {
  agentRunId: AgentRunId;
  fallbackIntentId?: IntentId;
  confidence?: number;
  source?: IntentResolutionSource;
  reason?: string;
  evidence?: IntentResolutionEvidence[];
  warnings?: string[];
  traceMetadata?: JsonObject;
  metadata?: JsonObject;
}): IntentResolutionResult {
  return {
    agentRunId: input.agentRunId,
    status: "fallback",
    resolvedIntentId: input.fallbackIntentId ?? "unknown",
    confidence: normalizeIntentConfidence(input.confidence ?? 0),
    source: input.source ?? "fallback",
    reason: input.reason,
    evidence: cloneEvidence(input.evidence),
    warnings: cloneStrings(input.warnings),
    fallbackIntentId: input.fallbackIntentId,
    traceMetadata: cloneJsonObject(input.traceMetadata),
    metadata: cloneJsonObject(input.metadata),
  };
}

export function buildIntentResolutionTraceMetadata(
  result: IntentResolutionResult,
): JsonObject {
  const metadata: JsonObject = {
    agentRunId: result.agentRunId,
    status: result.status,
    resolvedIntentId: result.resolvedIntentId,
    confidence: result.confidence,
    source: result.source,
  };

  if (result.reason) {
    metadata.reason = result.reason;
  }
  if (result.fallbackIntentId) {
    metadata.fallbackIntentId = result.fallbackIntentId;
  }
  if (result.evidence.length > 0) {
    metadata.evidence = result.evidence.map((item) => {
      const evidence: JsonObject = {
        type: item.type,
        value: item.value,
      };
      if (item.metadata) {
        evidence.metadata = { ...item.metadata };
      }
      return evidence;
    });
  }
  if (result.warnings.length > 0) {
    metadata.warnings = [...result.warnings];
  }
  if (result.traceMetadata) {
    metadata.traceMetadata = { ...result.traceMetadata };
  }
  if (result.metadata) {
    metadata.metadata = { ...result.metadata };
  }

  return metadata;
}

function cloneEvidence(
  evidence?: IntentResolutionEvidence[],
): IntentResolutionEvidence[] {
  return (
    evidence?.map((item) =>
      item.metadata
        ? { type: item.type, value: item.value, metadata: { ...item.metadata } }
        : { type: item.type, value: item.value },
    ) ?? []
  );
}

function cloneStrings(items?: string[]): string[] {
  return items ? [...items] : [];
}

function cloneJsonObject(value?: JsonObject): JsonObject | undefined {
  return value ? { ...value } : undefined;
}
