import type { AgentRunId } from "./runId";
import type {
  ExecutionResult,
  ExecutionStepResult,
  ExecutionStatus,
} from "./execution";
import type {
  IntentId,
  IntentResolutionEvidence,
  IntentResolutionResult,
  IntentResolutionSource,
  IntentResolutionStatus,
} from "./intent";
import type {
  PlanId,
  PlanPreconditionResult,
  PlanSelectionResult,
  PlanSelectionStatus,
  PlanStep,
  ResponseStrategy,
  RunBudget,
} from "./plan";
import type {
  ToolRoutingBudgetStatus,
  ToolRoutingPreconditionStatus,
  ToolRoutingResult,
  ToolRoutingStatus,
} from "./toolRouter";
import type {
  JsonObject,
  TraceEvent,
  TraceEventSeverity,
  OrchestrationTraceEventType,
} from "./types";
import { createTraceEvent } from "./trace";

export type OrchestrationTraceStage =
  | "orchestration"
  | "intent_resolution"
  | "plan_selection"
  | "plan_step"
  | "tool_routing"
  | "execution"
  | "budget"
  | "fallback";

export type OrchestrationTraceContextSummary = {
  dashboardName?: string;
  workbookName?: string;
  viewName?: string;
  worksheetNames?: string[];
  worksheetCount?: number;
  selectedMarks?: {
    hasSelectedMarks?: boolean;
    totalCount?: number;
    previewCount?: number;
    truncated?: boolean;
    worksheetCount?: number;
    worksheetNames?: string[];
  };
  summaryDataPreview?: {
    worksheetCount?: number;
    rowCount?: number;
    columnCount?: number;
    previewRowCount?: number;
    previewColumnCount?: number;
    truncated?: boolean;
  };
  contextPackId?: string;
  source?: string;
  updatedAt?: string;
};

export type OrchestrationTraceBudgetSnapshot = {
  maxModelCalls?: number;
  maxToolCalls?: number;
  timeoutMs?: number;
  maxRetries?: number;
  maxContextItems?: number;
  maxSummaryRows?: number;
  maxSummaryColumns?: number;
};

export type OrchestrationTraceBudgetUsage = {
  modelCallsUsed?: number;
  toolCallsUsed?: number;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  exceeded?: boolean;
};

export type OrchestrationTraceSelectionSummary = {
  planId?: PlanId;
  title?: string;
  responseStrategy?: ResponseStrategy;
  matched?: boolean;
  reasonBrief?: string;
  fallbackPlanId?: PlanId;
  preconditionCount?: number;
  failedPreconditionCount?: number;
};

export type OrchestrationTraceStepSummary = {
  stepId: string;
  stepType: PlanStep["type"];
  status: ExecutionStepResult["status"];
  toolName?: string;
  reason?: string;
};

export type OrchestrationTraceEvidenceSummary = {
  type: string;
  value: string;
  metadata?: JsonObject;
};

export type OrchestrationTracePreconditionSummary = {
  id: string;
  type: string;
  required: boolean;
  satisfied?: boolean;
  reasonBrief?: string;
  fallbackReason?: string;
};

export type OrchestrationTraceMetadata = {
  agentRunId?: AgentRunId;
  stage?: OrchestrationTraceStage;
  eventState?: "started" | "completed" | "failed" | "skipped" | "blocked";
  intentId?: IntentId;
  intentResolutionStatus?: IntentResolutionStatus;
  intentResolutionSource?: IntentResolutionSource;
  confidence?: number;
  planId?: PlanId;
  planSelectionStatus?: PlanSelectionStatus;
  stepId?: string;
  stepType?: PlanStep["type"] | string;
  toolName?: string;
  toolRoutingStatus?: ToolRoutingStatus;
  toolRoutingPreconditionStatus?: ToolRoutingPreconditionStatus;
  executionStatus?: ExecutionStatus;
  budget?: OrchestrationTraceBudgetSnapshot;
  budgetUsage?: OrchestrationTraceBudgetUsage;
  fallbackReason?: string;
  warnings?: string[];
  errorMessage?: string;
  durationMs?: number;
  frontendActionId?: string;
  contextSummary?: OrchestrationTraceContextSummary;
  evidenceCount?: number;
  evidenceSummary?: OrchestrationTraceEvidenceSummary[];
  selectedPlan?: OrchestrationTraceSelectionSummary;
  preconditions?: OrchestrationTracePreconditionSummary[];
  requestedToolName?: string;
  routingReason?: string;
  routingBudgetStatus?: ToolRoutingBudgetStatus;
  routingFallbackBehavior?: JsonObject;
  stepResults?: OrchestrationTraceStepSummary[];
  stepResultsTruncated?: boolean;
  executedStepCount?: number;
  skippedStepCount?: number;
  blockedStepCount?: number;
  errors?: Array<{
    message: string;
    stepId?: string;
    stepType?: PlanStep["type"];
  }>;
  errorsTruncated?: boolean;
  resultStatus?: string;
  traceMetadata?: JsonObject;
  metadata?: JsonObject;
};

export type OrchestrationTraceEventInput = {
  agentRunId: AgentRunId;
  type: OrchestrationTraceEventType;
  message?: string;
  severity?: TraceEventSeverity;
  metadata?: OrchestrationTraceMetadata;
  at?: string;
  eventId?: string;
};

export function createOrchestrationTraceEvent(
  input: OrchestrationTraceEventInput,
): TraceEvent {
  const eventState = inferEventState(input.type);
  const metadata = input.metadata
    ? { ...input.metadata, ...(eventState ? { eventState } : {}) }
    : eventState
      ? { eventState }
      : undefined;

  return createTraceEvent({
    agentRunId: input.agentRunId,
    type: input.type,
    message: input.message ?? defaultTraceMessage(input.type),
    severity: input.severity,
    metadata: metadata
      ? (sanitizeOrchestrationTraceMetadata(metadata) as JsonObject)
      : undefined,
    at: input.at,
    eventId: input.eventId,
  });
}

export function createOrchestrationStartedTraceEvent(
  input: Omit<OrchestrationTraceEventInput, "type">,
): TraceEvent {
  return createOrchestrationTraceEvent({
    ...input,
    type: "orchestration.started",
  });
}

export function createOrchestrationCompletedTraceEvent(
  input: Omit<OrchestrationTraceEventInput, "type">,
): TraceEvent {
  return createOrchestrationTraceEvent({
    ...input,
    type: "orchestration.completed",
  });
}

export function createOrchestrationFailedTraceEvent(
  input: Omit<OrchestrationTraceEventInput, "type">,
): TraceEvent {
  return createOrchestrationTraceEvent({
    ...input,
    type: "orchestration.failed",
  });
}

export function createIntentResolutionTraceEvent(input: {
  agentRunId: AgentRunId;
  type: Extract<
    OrchestrationTraceEventType,
    | "intent_resolution.started"
    | "intent_resolution.completed"
    | "intent_resolution.failed"
  >;
  result: IntentResolutionResult;
  frontendActionId?: string;
  contextSummary?: OrchestrationTraceContextSummary;
  message?: string;
  severity?: TraceEventSeverity;
  metadata?: JsonObject;
  at?: string;
  eventId?: string;
}): TraceEvent {
  return createOrchestrationTraceEvent({
    agentRunId: input.agentRunId,
    type: input.type,
    message:
      input.message ?? defaultIntentResolutionMessage(input.type, input.result),
    severity: input.severity,
    metadata: buildIntentResolutionTraceMetadata(input.result, {
      frontendActionId: input.frontendActionId,
      contextSummary: input.contextSummary,
      metadata: input.metadata,
    }),
    at: input.at,
    eventId: input.eventId,
  });
}

export function createPlanSelectionTraceEvent(input: {
  agentRunId: AgentRunId;
  type: Extract<
    OrchestrationTraceEventType,
    | "plan_selection.started"
    | "plan_selection.completed"
    | "plan_selection.failed"
  >;
  selection: PlanSelectionResult;
  contextSummary?: OrchestrationTraceContextSummary;
  message?: string;
  severity?: TraceEventSeverity;
  metadata?: JsonObject;
  at?: string;
  eventId?: string;
}): TraceEvent {
  return createOrchestrationTraceEvent({
    agentRunId: input.agentRunId,
    type: input.type,
    message:
      input.message ?? defaultPlanSelectionMessage(input.type, input.selection),
    severity: input.severity,
    metadata: buildPlanSelectionTraceMetadata(input.selection, {
      contextSummary: input.contextSummary,
      metadata: input.metadata,
    }),
    at: input.at,
    eventId: input.eventId,
  });
}

export function createPlanStepTraceEvent(input: {
  agentRunId: AgentRunId;
  type: Extract<
    OrchestrationTraceEventType,
    | "plan_step.started"
    | "plan_step.completed"
    | "plan_step.skipped"
    | "plan_step.blocked"
    | "plan_step.failed"
  >;
  planId: PlanId;
  intentId?: IntentId;
  stepId: string;
  stepType: PlanStep["type"];
  toolName?: string;
  reason?: string;
  warnings?: string[];
  contextSummary?: OrchestrationTraceContextSummary;
  metadata?: JsonObject;
  at?: string;
  eventId?: string;
  severity?: TraceEventSeverity;
}): TraceEvent {
  return createOrchestrationTraceEvent({
    agentRunId: input.agentRunId,
    type: input.type,
    message: defaultPlanStepMessage(input.type, input.stepId, input.stepType),
    severity: input.severity,
    metadata: buildPlanStepTraceMetadata({
      agentRunId: input.agentRunId,
      planId: input.planId,
      intentId: input.intentId,
      stepId: input.stepId,
      stepType: input.stepType,
      toolName: input.toolName,
      reason: input.reason,
      warnings: input.warnings,
      contextSummary: input.contextSummary,
      metadata: input.metadata,
    }),
    at: input.at,
    eventId: input.eventId,
  });
}

export function createToolRoutingTraceEvent(input: {
  agentRunId: AgentRunId;
  type: Extract<
    OrchestrationTraceEventType,
    | "tool_routing.started"
    | "tool_routing.completed"
    | "tool_routing.blocked"
    | "tool_routing.skipped"
    | "tool_routing.failed"
  >;
  result: ToolRoutingResult;
  contextSummary?: OrchestrationTraceContextSummary;
  message?: string;
  severity?: TraceEventSeverity;
  metadata?: JsonObject;
  at?: string;
  eventId?: string;
}): TraceEvent {
  return createOrchestrationTraceEvent({
    agentRunId: input.agentRunId,
    type: input.type,
    message:
      input.message ?? defaultToolRoutingMessage(input.type, input.result),
    severity: input.severity,
    metadata: buildToolRoutingTraceMetadata(input.result, {
      contextSummary: input.contextSummary,
      metadata: input.metadata,
    }),
    at: input.at,
    eventId: input.eventId,
  });
}

export function createBudgetTraceEvent(input: {
  agentRunId: AgentRunId;
  budget?: OrchestrationTraceBudgetSnapshot;
  budgetUsage?: OrchestrationTraceBudgetUsage;
  message?: string;
  severity?: TraceEventSeverity;
  metadata?: JsonObject;
  at?: string;
  eventId?: string;
}): TraceEvent {
  return createOrchestrationTraceEvent({
    agentRunId: input.agentRunId,
    type: "budget.updated",
    message: input.message ?? "Budget usage updated.",
    severity: input.severity,
    metadata: buildBudgetTraceMetadata({
      agentRunId: input.agentRunId,
      budget: input.budget,
      budgetUsage: input.budgetUsage,
      metadata: input.metadata,
    }),
    at: input.at,
    eventId: input.eventId,
  });
}

export function createFallbackTraceEvent(input: {
  agentRunId: AgentRunId;
  fallbackReason: string;
  intentId?: IntentId;
  planId?: PlanId;
  stepId?: string;
  toolName?: string;
  contextSummary?: OrchestrationTraceContextSummary;
  message?: string;
  severity?: TraceEventSeverity;
  metadata?: JsonObject;
  at?: string;
  eventId?: string;
}): TraceEvent {
  return createOrchestrationTraceEvent({
    agentRunId: input.agentRunId,
    type: "fallback.selected",
    message: input.message ?? "Fallback path selected.",
    severity: input.severity,
    metadata: buildFallbackTraceMetadata({
      agentRunId: input.agentRunId,
      fallbackReason: input.fallbackReason,
      intentId: input.intentId,
      planId: input.planId,
      stepId: input.stepId,
      toolName: input.toolName,
      contextSummary: input.contextSummary,
      metadata: input.metadata,
    }),
    at: input.at,
    eventId: input.eventId,
  });
}

export function buildIntentResolutionTraceMetadata(
  result: IntentResolutionResult,
  extras?: {
    frontendActionId?: string;
    contextSummary?: OrchestrationTraceContextSummary;
    metadata?: JsonObject;
  },
): OrchestrationTraceMetadata {
  return {
    agentRunId: result.agentRunId,
    stage: "intent_resolution",
    resultStatus: result.status,
    intentId: result.resolvedIntentId,
    intentResolutionStatus: result.status,
    intentResolutionSource: result.source,
    confidence: result.confidence,
    ...(result.reason ? { fallbackReason: result.reason } : {}),
    ...(result.warnings.length > 0 ? { warnings: [...result.warnings] } : {}),
    evidenceCount: result.evidence.length,
    ...(result.evidence.length > 0
      ? {
          evidenceSummary: result.evidence
            .slice(0, 10)
            .map((evidence) => summarizeEvidence(evidence)),
        }
      : {}),
    ...(result.fallbackIntentId ? { fallbackReason: result.reason } : {}),
    ...(result.traceMetadata
      ? { traceMetadata: cloneJsonObject(result.traceMetadata) }
      : {}),
    ...(extras?.frontendActionId
      ? { frontendActionId: extras.frontendActionId }
      : {}),
    ...(extras?.contextSummary
      ? { contextSummary: summarizeContextSummary(extras.contextSummary) }
      : {}),
    ...(mergeJsonObjects(result.metadata, extras?.metadata)
      ? { metadata: mergeJsonObjects(result.metadata, extras?.metadata) }
      : {}),
  };
}

export function buildPlanSelectionTraceMetadata(
  selection: PlanSelectionResult,
  extras?: {
    contextSummary?: OrchestrationTraceContextSummary;
    metadata?: JsonObject;
  },
): OrchestrationTraceMetadata {
  const failedPreconditionCount = selection.preconditions.filter(
    (precondition) => !precondition.satisfied,
  ).length;

  return {
    agentRunId: selection.agentRunId,
    stage: "plan_selection",
    resultStatus: selection.status,
    intentId: selection.resolvedIntentId,
    planId: selection.selectedPlan.id,
    planSelectionStatus: selection.status,
    selectedPlan: {
      planId: selection.selectedPlan.id,
      title: selection.selectedPlan.title,
      responseStrategy: selection.selectedPlan.responseStrategy,
      matched: selection.matched,
      reasonBrief: selection.reasonBrief,
      fallbackPlanId: selection.fallbackPlan?.id,
      preconditionCount: selection.preconditions.length,
      failedPreconditionCount,
    },
    budget: summarizeRunBudget(selection.selectedPlan.budget),
    preconditions: selection.preconditions
      .slice(0, 10)
      .map((precondition) => summarizePrecondition(precondition)),
    ...(selection.reasonBrief ? { fallbackReason: selection.reasonBrief } : {}),
    ...(selection.traceMetadata
      ? { traceMetadata: cloneJsonObject(selection.traceMetadata) }
      : {}),
    ...(extras?.contextSummary
      ? { contextSummary: summarizeContextSummary(extras.contextSummary) }
      : {}),
    ...(mergeJsonObjects(selection.metadata, extras?.metadata)
      ? { metadata: mergeJsonObjects(selection.metadata, extras?.metadata) }
      : {}),
  };
}

export function buildPlanStepTraceMetadata(input: {
  agentRunId: AgentRunId;
  planId: PlanId;
  intentId?: IntentId;
  stepId: string;
  stepType: PlanStep["type"];
  toolName?: string;
  reason?: string;
  warnings?: string[];
  contextSummary?: OrchestrationTraceContextSummary;
  metadata?: JsonObject;
}): OrchestrationTraceMetadata {
  return {
    agentRunId: input.agentRunId,
    stage: "plan_step",
    planId: input.planId,
    intentId: input.intentId,
    stepId: input.stepId,
    stepType: input.stepType,
    ...(input.toolName ? { toolName: input.toolName } : {}),
    ...(input.reason ? { routingReason: input.reason } : {}),
    ...(input.warnings && input.warnings.length > 0
      ? { warnings: [...input.warnings] }
      : {}),
    ...(input.contextSummary
      ? { contextSummary: summarizeContextSummary(input.contextSummary) }
      : {}),
    ...(input.metadata ? { metadata: cloneJsonObject(input.metadata) } : {}),
  };
}

export function buildToolRoutingTraceMetadata(
  result: ToolRoutingResult,
  extras?: {
    contextSummary?: OrchestrationTraceContextSummary;
    metadata?: JsonObject;
  },
): OrchestrationTraceMetadata {
  return {
    agentRunId: result.agentRunId,
    stage: "tool_routing",
    resultStatus: result.status,
    intentId: result.intentId,
    planId: result.planId,
    stepId: result.stepId,
    toolName: result.toolName,
    toolRoutingStatus: result.status,
    toolRoutingPreconditionStatus: result.preconditionStatus,
    routingReason: result.reason,
    routingBudgetStatus: { ...result.budgetStatus },
    ...(result.warnings.length > 0 ? { warnings: [...result.warnings] } : {}),
    ...(result.fallbackBehavior
      ? {
          routingFallbackBehavior: cloneJsonObject(
            result.fallbackBehavior as JsonObject,
          ),
        }
      : {}),
    ...(result.traceMetadata
      ? { traceMetadata: cloneJsonObject(result.traceMetadata) }
      : {}),
    ...(extras?.contextSummary
      ? { contextSummary: summarizeContextSummary(extras.contextSummary) }
      : {}),
    ...(mergeJsonObjects(result.metadata, extras?.metadata)
      ? { metadata: mergeJsonObjects(result.metadata, extras?.metadata) }
      : {}),
  };
}

export function buildBudgetTraceMetadata(input: {
  agentRunId: AgentRunId;
  budget?: OrchestrationTraceBudgetSnapshot;
  budgetUsage?: OrchestrationTraceBudgetUsage;
  metadata?: JsonObject;
}): OrchestrationTraceMetadata {
  return {
    agentRunId: input.agentRunId,
    stage: "budget",
    budget: input.budget ? { ...input.budget } : undefined,
    budgetUsage: input.budgetUsage ? { ...input.budgetUsage } : undefined,
    ...(input.metadata ? { metadata: cloneJsonObject(input.metadata) } : {}),
  };
}

export function buildExecutionTraceMetadata(
  result: ExecutionResult,
  extras?: {
    contextSummary?: OrchestrationTraceContextSummary;
    metadata?: JsonObject;
  },
): OrchestrationTraceMetadata {
  const stepResults = result.stepResults
    .slice(0, 10)
    .map((step) => summarizeStepResult(step));
  const hasTruncation = result.stepResults.length > stepResults.length;

  return {
    agentRunId: result.agentRunId,
    stage: "execution",
    resultStatus: result.status,
    intentId: result.intentId,
    planId: result.planId,
    executionStatus: result.status,
    executedStepCount: result.executedSteps.length,
    skippedStepCount: result.skippedSteps.length,
    blockedStepCount: result.blockedSteps.length,
    stepResults,
    ...(hasTruncation ? { stepResultsTruncated: true } : {}),
    budget: summarizeRunBudget({
      maxModelCalls: result.budgetUsage.maxModelCalls,
      maxToolCalls: result.budgetUsage.maxToolCalls,
      timeoutMs: result.budgetUsage.timeoutMs,
    }),
    budgetUsage: {
      modelCallsUsed: result.budgetUsage.modelCallsUsed,
      toolCallsUsed: result.budgetUsage.toolCallsUsed,
      startedAt: result.budgetUsage.startedAt,
      completedAt: result.budgetUsage.completedAt,
      durationMs: result.budgetUsage.durationMs,
      exceeded:
        result.budgetUsage.modelCallsUsed > result.budgetUsage.maxModelCalls ||
        result.budgetUsage.toolCallsUsed > result.budgetUsage.maxToolCalls,
    },
    ...(result.warnings.length > 0 ? { warnings: [...result.warnings] } : {}),
    ...(result.errors.length > 0
      ? {
          errorMessage: result.errors[0]?.message,
          errors: result.errors.slice(0, 10).map((error) => ({
            message: error.message,
            ...(error.stepId ? { stepId: error.stepId } : {}),
            ...(error.stepType ? { stepType: error.stepType } : {}),
          })),
          ...(result.errors.length > 10 ? { errorsTruncated: true } : {}),
        }
      : {}),
    ...(result.fallbackReason ? { fallbackReason: result.fallbackReason } : {}),
    ...(result.traceMetadata
      ? { traceMetadata: cloneJsonObject(result.traceMetadata) }
      : {}),
    ...(extras?.contextSummary
      ? { contextSummary: summarizeContextSummary(extras.contextSummary) }
      : {}),
    ...(mergeJsonObjects(result.metadata, extras?.metadata)
      ? { metadata: mergeJsonObjects(result.metadata, extras?.metadata) }
      : {}),
  };
}

export function buildFallbackTraceMetadata(input: {
  agentRunId: AgentRunId;
  fallbackReason: string;
  intentId?: IntentId;
  planId?: PlanId;
  stepId?: string;
  toolName?: string;
  contextSummary?: OrchestrationTraceContextSummary;
  metadata?: JsonObject;
}): OrchestrationTraceMetadata {
  return {
    agentRunId: input.agentRunId,
    stage: "fallback",
    intentId: input.intentId,
    planId: input.planId,
    stepId: input.stepId,
    toolName: input.toolName,
    fallbackReason: input.fallbackReason,
    ...(input.contextSummary
      ? { contextSummary: summarizeContextSummary(input.contextSummary) }
      : {}),
    ...(input.metadata ? { metadata: cloneJsonObject(input.metadata) } : {}),
  };
}

function defaultTraceMessage(type: OrchestrationTraceEventType): string {
  switch (type) {
    case "orchestration.started":
      return "Orchestration started.";
    case "orchestration.completed":
      return "Orchestration completed.";
    case "orchestration.failed":
      return "Orchestration failed.";
    case "intent_resolution.started":
      return "Intent resolution started.";
    case "intent_resolution.completed":
      return "Intent resolution completed.";
    case "intent_resolution.failed":
      return "Intent resolution failed.";
    case "plan_selection.started":
      return "Plan selection started.";
    case "plan_selection.completed":
      return "Plan selection completed.";
    case "plan_selection.failed":
      return "Plan selection failed.";
    case "execution.started":
      return "Execution started.";
    case "execution.completed":
      return "Execution completed.";
    case "execution.failed":
      return "Execution failed.";
    case "plan_step.started":
      return "Plan step started.";
    case "plan_step.completed":
      return "Plan step completed.";
    case "plan_step.skipped":
      return "Plan step skipped.";
    case "plan_step.blocked":
      return "Plan step blocked.";
    case "plan_step.failed":
      return "Plan step failed.";
    case "tool_routing.started":
      return "Tool routing started.";
    case "tool_routing.completed":
      return "Tool routing completed.";
    case "tool_routing.blocked":
      return "Tool routing blocked.";
    case "tool_routing.skipped":
      return "Tool routing skipped.";
    case "tool_routing.failed":
      return "Tool routing failed.";
    case "budget.updated":
      return "Budget usage updated.";
    case "fallback.selected":
      return "Fallback selected.";
    default:
      return "Orchestration event.";
  }
}

function inferEventState(
  type: OrchestrationTraceEventType,
): OrchestrationTraceMetadata["eventState"] {
  if (type.endsWith(".started")) {
    return "started";
  }

  if (type.endsWith(".completed")) {
    return "completed";
  }

  if (type.endsWith(".failed")) {
    return "failed";
  }

  if (type.endsWith(".skipped")) {
    return "skipped";
  }

  if (type.endsWith(".blocked")) {
    return "blocked";
  }

  return undefined;
}

function defaultIntentResolutionMessage(
  type: Extract<
    OrchestrationTraceEventType,
    | "intent_resolution.started"
    | "intent_resolution.completed"
    | "intent_resolution.failed"
  >,
  result: IntentResolutionResult,
): string {
  if (type === "intent_resolution.started") {
    return "Intent resolution started.";
  }

  if (type === "intent_resolution.failed") {
    return result.reason
      ? `Intent resolution failed: ${result.reason}`
      : "Intent resolution failed.";
  }

  return `Intent resolved as '${result.resolvedIntentId}'.`;
}

function defaultPlanSelectionMessage(
  type: Extract<
    OrchestrationTraceEventType,
    | "plan_selection.started"
    | "plan_selection.completed"
    | "plan_selection.failed"
  >,
  selection: PlanSelectionResult,
): string {
  if (type === "plan_selection.started") {
    return "Plan selection started.";
  }

  if (type === "plan_selection.failed") {
    return selection.reasonBrief
      ? `Plan selection failed: ${selection.reasonBrief}`
      : "Plan selection failed.";
  }

  return `Plan selected: '${selection.selectedPlan.id}'.`;
}

function defaultPlanStepMessage(
  type: Extract<
    OrchestrationTraceEventType,
    | "plan_step.started"
    | "plan_step.completed"
    | "plan_step.skipped"
    | "plan_step.blocked"
    | "plan_step.failed"
  >,
  stepId: string,
  stepType: PlanStep["type"],
): string {
  const base = `Plan step '${stepId}' (${stepType})`;

  switch (type) {
    case "plan_step.started":
      return `${base} started.`;
    case "plan_step.completed":
      return `${base} completed.`;
    case "plan_step.skipped":
      return `${base} skipped.`;
    case "plan_step.blocked":
      return `${base} blocked.`;
    case "plan_step.failed":
      return `${base} failed.`;
    default:
      return "Plan step event.";
  }
}

function defaultToolRoutingMessage(
  type: Extract<
    OrchestrationTraceEventType,
    | "tool_routing.started"
    | "tool_routing.completed"
    | "tool_routing.blocked"
    | "tool_routing.skipped"
    | "tool_routing.failed"
  >,
  result: ToolRoutingResult,
): string {
  const toolName = result.toolName ?? "unknown-tool";

  switch (type) {
    case "tool_routing.started":
      return `Tool routing started for '${toolName}'.`;
    case "tool_routing.completed":
      return `Tool routing completed for '${toolName}'.`;
    case "tool_routing.blocked":
      return result.reason
        ? `Tool routing blocked for '${toolName}': ${result.reason}`
        : `Tool routing blocked for '${toolName}'.`;
    case "tool_routing.skipped":
      return result.reason
        ? `Tool routing skipped for '${toolName}': ${result.reason}`
        : `Tool routing skipped for '${toolName}'.`;
    case "tool_routing.failed":
      return result.reason
        ? `Tool routing failed for '${toolName}': ${result.reason}`
        : `Tool routing failed for '${toolName}'.`;
    default:
      return "Tool routing event.";
  }
}

function summarizeContextSummary(
  input: OrchestrationTraceContextSummary,
): OrchestrationTraceContextSummary {
  const summary: OrchestrationTraceContextSummary = {};

  const dashboardName = normalizeString(input.dashboardName);
  if (dashboardName) {
    summary.dashboardName = dashboardName;
  }

  const workbookName = normalizeString(input.workbookName);
  if (workbookName) {
    summary.workbookName = workbookName;
  }

  const viewName = normalizeString(input.viewName);
  if (viewName) {
    summary.viewName = viewName;
  }

  const contextPackId = normalizeString(input.contextPackId);
  if (contextPackId) {
    summary.contextPackId = contextPackId;
  }

  const source = normalizeString(input.source);
  if (source) {
    summary.source = source;
  }

  const updatedAt = normalizeString(input.updatedAt);
  if (updatedAt) {
    summary.updatedAt = updatedAt;
  }

  const worksheetNames = normalizeStringArray(input.worksheetNames, 10);
  if (worksheetNames) {
    summary.worksheetNames = worksheetNames;
  }

  if (isFiniteNumber(input.worksheetCount)) {
    summary.worksheetCount = input.worksheetCount;
  }

  const selectedMarks = input.selectedMarks;
  if (selectedMarks) {
    summary.selectedMarks = {
      ...(typeof selectedMarks.hasSelectedMarks === "boolean"
        ? { hasSelectedMarks: selectedMarks.hasSelectedMarks }
        : {}),
      ...(isFiniteNumber(selectedMarks.totalCount)
        ? { totalCount: selectedMarks.totalCount }
        : {}),
      ...(isFiniteNumber(selectedMarks.previewCount)
        ? { previewCount: selectedMarks.previewCount }
        : {}),
      ...(typeof selectedMarks.truncated === "boolean"
        ? { truncated: selectedMarks.truncated }
        : {}),
      ...(isFiniteNumber(selectedMarks.worksheetCount)
        ? { worksheetCount: selectedMarks.worksheetCount }
        : {}),
      ...(normalizeStringArray(selectedMarks.worksheetNames, 10)
        ? {
            worksheetNames: normalizeStringArray(
              selectedMarks.worksheetNames,
              10,
            ),
          }
        : {}),
    };
  } else if (
    typeof (input as JsonObject).hasSelectedMarks === "boolean" ||
    isFiniteNumber((input as JsonObject).selectedMarkCount) ||
    normalizeStringArray((input as JsonObject).worksheetNames, 10)
  ) {
    summary.selectedMarks = {
      ...(typeof (input as JsonObject).hasSelectedMarks === "boolean"
        ? {
            hasSelectedMarks: (input as JsonObject).hasSelectedMarks as boolean,
          }
        : {}),
      ...(isFiniteNumber((input as JsonObject).selectedMarkCount)
        ? { totalCount: (input as JsonObject).selectedMarkCount as number }
        : {}),
      ...(isFiniteNumber((input as JsonObject).selectedMarkPreviewCount)
        ? {
            previewCount: (input as JsonObject)
              .selectedMarkPreviewCount as number,
          }
        : {}),
      ...(typeof (input as JsonObject).selectedMarksTruncated === "boolean"
        ? { truncated: (input as JsonObject).selectedMarksTruncated as boolean }
        : {}),
      ...(normalizeStringArray((input as JsonObject).worksheetNames, 10)
        ? {
            worksheetNames: normalizeStringArray(
              (input as JsonObject).worksheetNames,
              10,
            ),
          }
        : {}),
    };
  }

  const summaryDataPreview = input.summaryDataPreview;
  if (summaryDataPreview) {
    summary.summaryDataPreview = {
      ...(isFiniteNumber(summaryDataPreview.worksheetCount)
        ? { worksheetCount: summaryDataPreview.worksheetCount }
        : {}),
      ...(isFiniteNumber(summaryDataPreview.rowCount)
        ? { rowCount: summaryDataPreview.rowCount }
        : {}),
      ...(isFiniteNumber(summaryDataPreview.columnCount)
        ? { columnCount: summaryDataPreview.columnCount }
        : {}),
      ...(isFiniteNumber(summaryDataPreview.previewRowCount)
        ? { previewRowCount: summaryDataPreview.previewRowCount }
        : {}),
      ...(isFiniteNumber(summaryDataPreview.previewColumnCount)
        ? { previewColumnCount: summaryDataPreview.previewColumnCount }
        : {}),
      ...(typeof summaryDataPreview.truncated === "boolean"
        ? { truncated: summaryDataPreview.truncated }
        : {}),
    };
  } else if (
    isFiniteNumber((input as JsonObject).summaryDataPreviewCount) ||
    isFiniteNumber((input as JsonObject).summaryDataPreviewRowCount) ||
    isFiniteNumber((input as JsonObject).summaryDataPreviewColumnCount) ||
    typeof (input as JsonObject).summaryDataPreviewTruncated === "boolean"
  ) {
    summary.summaryDataPreview = {
      ...(isFiniteNumber((input as JsonObject).summaryDataPreviewCount)
        ? {
            worksheetCount: (input as JsonObject)
              .summaryDataPreviewCount as number,
          }
        : {}),
      ...(isFiniteNumber((input as JsonObject).summaryDataPreviewRowCount)
        ? {
            rowCount: (input as JsonObject)
              .summaryDataPreviewRowCount as number,
          }
        : {}),
      ...(isFiniteNumber((input as JsonObject).summaryDataPreviewColumnCount)
        ? {
            columnCount: (input as JsonObject)
              .summaryDataPreviewColumnCount as number,
          }
        : {}),
      ...(typeof (input as JsonObject).summaryDataPreviewTruncated === "boolean"
        ? {
            truncated: (input as JsonObject)
              .summaryDataPreviewTruncated as boolean,
          }
        : {}),
    };
  }

  return summary;
}

function summarizeEvidence(
  evidence: IntentResolutionEvidence,
): OrchestrationTraceEvidenceSummary {
  return {
    type: evidence.type,
    value: evidence.value,
    ...(evidence.metadata
      ? { metadata: cloneJsonObject(evidence.metadata) }
      : {}),
  };
}

function summarizePrecondition(
  precondition: PlanPreconditionResult,
): OrchestrationTracePreconditionSummary {
  return {
    id: precondition.id,
    type: precondition.type,
    required: precondition.required,
    satisfied: precondition.satisfied,
    reasonBrief: precondition.reasonBrief,
    ...(precondition.fallbackReason
      ? { fallbackReason: precondition.fallbackReason }
      : {}),
  };
}

function summarizeStepResult(
  step: ExecutionStepResult,
): OrchestrationTraceStepSummary {
  return {
    stepId: step.stepId,
    stepType: step.stepType,
    status: step.status,
    ...(step.toolName ? { toolName: step.toolName } : {}),
    ...(step.reason ? { reason: step.reason } : {}),
  };
}

function summarizeRunBudget(
  budget: RunBudget,
): OrchestrationTraceBudgetSnapshot {
  return {
    maxModelCalls: budget.maxModelCalls,
    maxToolCalls: budget.maxToolCalls,
    timeoutMs: budget.timeoutMs,
    ...(budget.maxRetries !== undefined
      ? { maxRetries: budget.maxRetries }
      : {}),
    ...(budget.maxContextItems !== undefined
      ? { maxContextItems: budget.maxContextItems }
      : {}),
    ...(budget.maxSummaryRows !== undefined
      ? { maxSummaryRows: budget.maxSummaryRows }
      : {}),
    ...(budget.maxSummaryColumns !== undefined
      ? { maxSummaryColumns: budget.maxSummaryColumns }
      : {}),
  };
}

function normalizeStringArray(
  value: unknown,
  maxItems: number,
): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, maxItems);

  return normalized.length > 0 ? normalized : undefined;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function cloneJsonObject(value?: JsonObject): JsonObject | undefined {
  return value ? { ...value } : undefined;
}

function mergeJsonObjects(
  ...values: Array<JsonObject | undefined>
): JsonObject | undefined {
  const merged = values.reduce<JsonObject>((accumulator, value) => {
    if (value) {
      return { ...accumulator, ...value };
    }

    return accumulator;
  }, {});

  return Object.keys(merged).length > 0 ? merged : undefined;
}

function sanitizeOrchestrationTraceMetadata(
  metadata: OrchestrationTraceMetadata,
): OrchestrationTraceMetadata {
  return {
    ...metadata,
    ...(metadata.contextSummary
      ? { contextSummary: summarizeContextSummary(metadata.contextSummary) }
      : {}),
    ...(metadata.evidenceSummary
      ? {
          evidenceSummary: metadata.evidenceSummary
            .slice(0, 10)
            .map((evidence) => ({
              type: evidence.type,
              value: evidence.value,
              ...(evidence.metadata
                ? { metadata: cloneJsonObject(evidence.metadata) }
                : {}),
            })),
        }
      : {}),
    ...(metadata.preconditions
      ? {
          preconditions: metadata.preconditions
            .slice(0, 10)
            .map((precondition) => ({ ...precondition })),
        }
      : {}),
    ...(metadata.stepResults
      ? {
          stepResults: metadata.stepResults.slice(0, 10).map((stepResult) => ({
            ...stepResult,
          })),
        }
      : {}),
    ...(metadata.budget ? { budget: { ...metadata.budget } } : {}),
    ...(metadata.budgetUsage
      ? { budgetUsage: { ...metadata.budgetUsage } }
      : {}),
    ...(metadata.traceMetadata
      ? { traceMetadata: { ...metadata.traceMetadata } }
      : {}),
    ...(metadata.metadata ? { metadata: { ...metadata.metadata } } : {}),
  };
}
