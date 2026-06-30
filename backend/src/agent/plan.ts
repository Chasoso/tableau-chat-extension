import type { AgentRunId } from "./runId";
import type { IntentId, IntentResolutionResult } from "./intent";
import type { ContextPack, JsonObject, ToolActionKind } from "./types";

export type PlanId =
  | "selected_mark_explanation-v1"
  | "current-dashboard-summary-v1"
  | "unsupported-intent-v1";

export type PlanContextPackId =
  | "dashboard_context"
  | "context_preview"
  | "selected_marks"
  | "summary_data_preview";

export type PlanStepType =
  | "collect_context"
  | "validate_context"
  | "call_tool"
  | "compose_response";

export type PlanPreconditionType =
  | "requires_context_pack"
  | "requires_selected_marks"
  | "requires_tool";

export type ResponseStrategy =
  | "explain_selection"
  | "summarize_context"
  | "direct_answer"
  | "fallback_message";

export type PlanMetadata = JsonObject;

export type RunBudget = {
  maxModelCalls: number;
  maxToolCalls: number;
  timeoutMs: number;
  maxRetries?: number;
  maxContextItems?: number;
  maxSummaryRows?: number;
  maxSummaryColumns?: number;
};

export type PlanToolPolicy = {
  mode: "allowlist" | "denylist";
  allowedTools: ToolActionKind[];
  disallowedTools: ToolActionKind[];
};

export type PlanPrecondition = {
  id: string;
  type: PlanPreconditionType;
  required: boolean;
  description?: string;
  contextPackId?: PlanContextPackId;
  minSelectedMarks?: number;
  toolName?: string;
  fallbackReason?: string;
  metadata?: PlanMetadata;
};

export type PlanPreconditionResult = {
  id: string;
  type: PlanPreconditionType;
  required: boolean;
  satisfied: boolean;
  reasonBrief: string;
  fallbackReason?: string;
  metadata?: PlanMetadata;
};

export type PlanStep = {
  id: string;
  type: PlanStepType;
  required: boolean;
  description?: string;
  input?: PlanMetadata;
  toolName?: string;
  outputKey?: string;
  onFailure?: "fail" | "skip" | "fallback";
  metadata?: PlanMetadata;
};

export type PlanFallback =
  | {
      kind: "fallback_to_plan";
      planId: PlanId;
      reasonBrief: string;
    }
  | {
      kind: "terminal";
      reasonBrief: string;
      responseStrategy: ResponseStrategy;
    };

export type PlanDefinition = {
  id: PlanId;
  intentId: IntentId;
  title: string;
  description?: string;
  requiredContextPacks: PlanContextPackId[];
  preconditions: PlanPrecondition[];
  allowedTools: ToolActionKind[];
  disallowedTools: ToolActionKind[];
  toolPolicy: PlanToolPolicy;
  steps: PlanStep[];
  budget: RunBudget;
  responseStrategy: ResponseStrategy;
  fallback: PlanFallback;
  metadata?: PlanMetadata;
};

export type PlanSelectionStatus = "selected" | "fallback" | "unsupported";

export type PlanSelectionInput = {
  agentRunId: AgentRunId;
  intentResolution: IntentResolutionResult;
  contextPack: ContextPack;
  availablePlanIds?: readonly PlanId[];
  metadata?: PlanMetadata;
};

export type PlanSelectionResult = {
  agentRunId: AgentRunId;
  status: PlanSelectionStatus;
  matched: boolean;
  resolvedIntentId: IntentId;
  selectedPlan: PlanDefinition;
  preconditions: PlanPreconditionResult[];
  reasonBrief: string;
  fallbackPlan?: PlanDefinition;
  unsupportedIntentId?: IntentId;
  metadata?: PlanMetadata;
  traceMetadata?: PlanMetadata;
};

export type PlanExecutionContext = {
  agentRunId: AgentRunId;
  contextPack: ContextPack;
  selectedPlan: PlanDefinition;
  selection: PlanSelectionResult;
  runBudget: RunBudget;
  metadata?: PlanMetadata;
  traceMetadata?: PlanMetadata;
};

const ALL_TOOL_KINDS: readonly ToolActionKind[] = [
  "context",
  "tableau-extension",
  "tableau-rest",
  "tableau-mcp",
  "notion",
  "llm",
];

const DEFAULT_AVAILABLE_PLAN_IDS: readonly PlanId[] = [
  "selected_mark_explanation-v1",
  "current-dashboard-summary-v1",
  "unsupported-intent-v1",
];

const DEFAULT_SELECTED_MARK_EXPLANATION_PLAN: PlanDefinition = {
  id: "selected_mark_explanation-v1",
  intentId: "selected_mark_explanation",
  title: "Selected mark explanation",
  description:
    "Explain the currently selected marks using the Tableau context snapshot.",
  requiredContextPacks: [
    "dashboard_context",
    "context_preview",
    "selected_marks",
  ],
  preconditions: [
    {
      id: "requires_dashboard_context",
      type: "requires_context_pack",
      required: true,
      description: "A dashboard context snapshot must be available.",
      contextPackId: "dashboard_context",
      fallbackReason: "Dashboard context is required.",
    },
    {
      id: "requires_selected_marks",
      type: "requires_selected_marks",
      required: true,
      description: "At least one selected mark must be available.",
      minSelectedMarks: 1,
      fallbackReason: "No selected marks are available.",
    },
  ],
  allowedTools: ["context"],
  disallowedTools: [
    "tableau-extension",
    "tableau-rest",
    "tableau-mcp",
    "notion",
    "llm",
  ],
  toolPolicy: {
    mode: "allowlist",
    allowedTools: ["context"],
    disallowedTools: [
      "tableau-extension",
      "tableau-rest",
      "tableau-mcp",
      "notion",
      "llm",
    ],
  },
  steps: [
    {
      id: "validate-context",
      type: "validate_context",
      required: true,
      description:
        "Validate that the dashboard context and selected marks are available.",
      input: {
        source: "context_pack",
      },
      outputKey: "validation",
      metadata: {
        requiredContextPacks: ["dashboard_context", "selected_marks"],
      },
    },
    {
      id: "route-selected-marks-context",
      type: "call_tool",
      required: true,
      description:
        "Route the selected marks context through the structured orchestration path.",
      toolName: "context",
      outputKey: "selectedMarksContext",
      metadata: {
        routeTarget: "selected_marks",
      },
    },
    {
      id: "route-summary-data-preview",
      type: "call_tool",
      required: false,
      description:
        "Route the summary data preview if it is available in the context snapshot.",
      toolName: "context",
      outputKey: "summaryDataPreview",
      metadata: {
        routeTarget: "summary_data_preview",
        optional: true,
      },
      onFailure: "skip",
    },
    {
      id: "compose-response",
      type: "compose_response",
      required: true,
      description:
        "Compose a safe placeholder response while the structured path is being wired.",
      outputKey: "response",
      metadata: {
        responseStrategy: "explain_selection",
      },
    },
  ],
  budget: {
    maxModelCalls: 0,
    maxToolCalls: 2,
    timeoutMs: 15_000,
  },
  responseStrategy: "explain_selection",
  fallback: {
    kind: "fallback_to_plan",
    planId: "unsupported-intent-v1",
    reasonBrief:
      "Fallback to the unsupported-intent plan when selected marks are unavailable.",
  },
  metadata: {
    planFamily: "fixed",
    source: "context_preview",
  },
};

const DEFAULT_CURRENT_DASHBOARD_SUMMARY_PLAN: PlanDefinition = {
  id: "current-dashboard-summary-v1",
  intentId: "current_dashboard_summary",
  title: "Current dashboard summary",
  description:
    "Summarize the current dashboard state from the context snapshot alone.",
  requiredContextPacks: ["dashboard_context"],
  preconditions: [
    {
      id: "requires_dashboard_context",
      type: "requires_context_pack",
      required: true,
      description: "A dashboard context snapshot must be available.",
      contextPackId: "dashboard_context",
      fallbackReason: "Dashboard context is required.",
    },
  ],
  allowedTools: [],
  disallowedTools: [...ALL_TOOL_KINDS],
  toolPolicy: {
    mode: "denylist",
    allowedTools: [],
    disallowedTools: [...ALL_TOOL_KINDS],
  },
  steps: [
    {
      id: "collect-context",
      type: "collect_context",
      required: true,
      description: "Collect the dashboard context snapshot.",
      input: {
        source: "context_pack",
      },
      outputKey: "context",
    },
    {
      id: "compose-response",
      type: "compose_response",
      required: true,
      description: "Summarize the current dashboard state from context only.",
      outputKey: "response",
      metadata: {
        responseStrategy: "summarize_context",
      },
    },
  ],
  budget: {
    maxModelCalls: 1,
    maxToolCalls: 0,
    timeoutMs: 15_000,
  },
  responseStrategy: "summarize_context",
  fallback: {
    kind: "fallback_to_plan",
    planId: "unsupported-intent-v1",
    reasonBrief:
      "Fallback to the unsupported-intent plan when the dashboard summary path cannot run.",
  },
  metadata: {
    planFamily: "fixed",
    source: "context_only",
  },
};

const DEFAULT_UNSUPPORTED_PLAN: PlanDefinition = {
  id: "unsupported-intent-v1",
  intentId: "unknown",
  title: "Unsupported intent",
  description: "Decline requests that do not map to a supported fixed plan.",
  requiredContextPacks: ["dashboard_context"],
  preconditions: [
    {
      id: "requires_dashboard_context",
      type: "requires_context_pack",
      required: true,
      description: "A dashboard context snapshot must be available.",
      contextPackId: "dashboard_context",
      fallbackReason: "Dashboard context is required.",
    },
  ],
  allowedTools: [],
  disallowedTools: [...ALL_TOOL_KINDS],
  toolPolicy: {
    mode: "denylist",
    allowedTools: [],
    disallowedTools: [...ALL_TOOL_KINDS],
  },
  steps: [
    {
      id: "validate-unsupported-request",
      type: "validate_context",
      required: true,
      description: "Record that the request does not map to a supported plan.",
      outputKey: "validation",
      metadata: {
        responseStrategy: "fallback_message",
      },
    },
    {
      id: "compose-fallback-response",
      type: "compose_response",
      required: true,
      description:
        "Return a safe fallback response for the unsupported request.",
      outputKey: "response",
      metadata: {
        responseStrategy: "fallback_message",
      },
    },
  ],
  budget: {
    maxModelCalls: 0,
    maxToolCalls: 0,
    timeoutMs: 5_000,
  },
  responseStrategy: "fallback_message",
  fallback: {
    kind: "terminal",
    reasonBrief: "This is the terminal fallback plan.",
    responseStrategy: "fallback_message",
  },
  metadata: {
    planFamily: "fallback",
    source: "unsupported",
  },
};

export const SELECTED_MARK_EXPLANATION_PLAN_DEFINITION =
  DEFAULT_SELECTED_MARK_EXPLANATION_PLAN;
export const CURRENT_DASHBOARD_SUMMARY_PLAN_DEFINITION =
  DEFAULT_CURRENT_DASHBOARD_SUMMARY_PLAN;
export const UNSUPPORTED_PLAN_DEFINITION = DEFAULT_UNSUPPORTED_PLAN;

export function normalizeRunBudget(input?: Partial<RunBudget>): RunBudget {
  return {
    maxModelCalls: normalizeInteger(input?.maxModelCalls, 1, 0),
    maxToolCalls: normalizeInteger(input?.maxToolCalls, 0, 0),
    timeoutMs: normalizeInteger(input?.timeoutMs, 15_000, 1),
    ...(input?.maxRetries !== undefined
      ? { maxRetries: normalizeInteger(input.maxRetries, 0, 0) }
      : {}),
    ...(input?.maxContextItems !== undefined
      ? { maxContextItems: normalizeInteger(input.maxContextItems, 0, 0) }
      : {}),
    ...(input?.maxSummaryRows !== undefined
      ? { maxSummaryRows: normalizeInteger(input.maxSummaryRows, 0, 0) }
      : {}),
    ...(input?.maxSummaryColumns !== undefined
      ? { maxSummaryColumns: normalizeInteger(input.maxSummaryColumns, 0, 0) }
      : {}),
  };
}

export function isValidRunBudget(
  input: Partial<RunBudget> | undefined,
): boolean {
  if (!input) {
    return false;
  }

  return (
    isNonNegativeInteger(input.maxModelCalls) &&
    isNonNegativeInteger(input.maxToolCalls) &&
    isPositiveInteger(input.timeoutMs) &&
    (input.maxRetries === undefined ||
      isNonNegativeInteger(input.maxRetries)) &&
    (input.maxContextItems === undefined ||
      isNonNegativeInteger(input.maxContextItems)) &&
    (input.maxSummaryRows === undefined ||
      isNonNegativeInteger(input.maxSummaryRows)) &&
    (input.maxSummaryColumns === undefined ||
      isNonNegativeInteger(input.maxSummaryColumns))
  );
}

export function createSelectedMarkExplanationPlanDefinition(
  metadata?: PlanMetadata,
): PlanDefinition {
  return clonePlanDefinition(DEFAULT_SELECTED_MARK_EXPLANATION_PLAN, metadata);
}

export function createCurrentDashboardSummaryPlanDefinition(
  metadata?: PlanMetadata,
): PlanDefinition {
  return clonePlanDefinition(DEFAULT_CURRENT_DASHBOARD_SUMMARY_PLAN, metadata);
}

export function createUnsupportedPlanDefinition(
  metadata?: PlanMetadata,
): PlanDefinition {
  return clonePlanDefinition(DEFAULT_UNSUPPORTED_PLAN, metadata);
}

export function evaluatePlanPreconditions(
  plan: PlanDefinition,
  contextPack: ContextPack,
): PlanPreconditionResult[] {
  return plan.preconditions.map((precondition) => {
    if (precondition.type === "requires_selected_marks") {
      const selectedMarkCount = getSelectedMarkCount(contextPack);
      const satisfied =
        selectedMarkCount >= (precondition.minSelectedMarks ?? 1);

      return {
        id: precondition.id,
        type: precondition.type,
        required: precondition.required,
        satisfied,
        reasonBrief: satisfied
          ? `Selected marks are available (${selectedMarkCount}).`
          : (precondition.fallbackReason ?? "Selected marks are required."),
        fallbackReason: precondition.fallbackReason,
        ...(precondition.metadata
          ? { metadata: { ...precondition.metadata } }
          : {}),
      };
    }

    if (precondition.type === "requires_context_pack") {
      const satisfied = Boolean(contextPack.dashboardContext);

      return {
        id: precondition.id,
        type: precondition.type,
        required: precondition.required,
        satisfied,
        reasonBrief: satisfied
          ? `Context pack '${precondition.contextPackId ?? "dashboard_context"}' is available.`
          : (precondition.fallbackReason ?? "Context pack is required."),
        fallbackReason: precondition.fallbackReason,
        ...(precondition.metadata
          ? { metadata: { ...precondition.metadata } }
          : {}),
      };
    }

    return {
      id: precondition.id,
      type: precondition.type,
      required: precondition.required,
      satisfied: false,
      reasonBrief:
        precondition.fallbackReason ??
        `Tool '${precondition.toolName ?? "unknown"}' is required.`,
      fallbackReason: precondition.fallbackReason,
      ...(precondition.metadata
        ? { metadata: { ...precondition.metadata } }
        : {}),
    };
  });
}

export function buildPlanSelection(
  input: PlanSelectionInput,
): PlanSelectionResult {
  const availablePlanIds = new Set<PlanId>(
    input.availablePlanIds ?? DEFAULT_AVAILABLE_PLAN_IDS,
  );
  const resolvedIntentId = input.intentResolution.resolvedIntentId;

  if (resolvedIntentId === "selected_mark_explanation") {
    return selectSelectedMarkExplanationPlan(input, availablePlanIds);
  }

  if (resolvedIntentId === "current_dashboard_summary") {
    return selectCurrentDashboardSummaryPlan(input, availablePlanIds);
  }

  return buildUnsupportedSelection(input, availablePlanIds, resolvedIntentId);
}

export function buildPlanExecutionMetadata(input: {
  selection: PlanSelectionResult;
  runBudget: RunBudget;
}): PlanMetadata {
  return {
    planId: input.selection.selectedPlan.id,
    intentId: input.selection.resolvedIntentId,
    status: input.selection.status,
    matched: input.selection.matched,
    reasonBrief: input.selection.reasonBrief,
    responseStrategy: input.selection.selectedPlan.responseStrategy,
    runBudget: toRunBudgetMetadata(input.runBudget),
    preconditions: input.selection.preconditions.map((precondition) =>
      toPlanPreconditionMetadata(precondition),
    ),
    ...(input.selection.metadata
      ? { selectionMetadata: { ...input.selection.metadata } }
      : {}),
  };
}

function selectSelectedMarkExplanationPlan(
  input: PlanSelectionInput,
  availablePlanIds: Set<PlanId>,
): PlanSelectionResult {
  const selectedPlan = createSelectedMarkExplanationPlanDefinition(
    input.metadata,
  );
  const fallbackPlan = createUnsupportedPlanDefinition(input.metadata);

  if (!availablePlanIds.has(selectedPlan.id)) {
    return buildUnsupportedSelection(
      input,
      availablePlanIds,
      input.intentResolution.resolvedIntentId,
      "selected_mark_explanation plan is not available.",
    );
  }

  const preconditions = evaluatePlanPreconditions(
    selectedPlan,
    input.contextPack,
  );
  const failingPrecondition = preconditions.find(
    (precondition) => precondition.required && !precondition.satisfied,
  );

  if (failingPrecondition) {
    return {
      agentRunId: input.agentRunId,
      status: "fallback",
      matched: true,
      resolvedIntentId: input.intentResolution.resolvedIntentId,
      selectedPlan,
      preconditions,
      reasonBrief:
        failingPrecondition.fallbackReason ?? failingPrecondition.reasonBrief,
      fallbackPlan,
      ...(input.metadata ? { metadata: { ...input.metadata } } : {}),
      traceMetadata: buildSelectionTraceMetadata({
        input,
        status: "fallback",
        plan: selectedPlan,
        reasonBrief:
          failingPrecondition.fallbackReason ?? failingPrecondition.reasonBrief,
        fallbackPlan,
      }),
    };
  }

  return {
    agentRunId: input.agentRunId,
    status: "selected",
    matched: true,
    resolvedIntentId: input.intentResolution.resolvedIntentId,
    selectedPlan,
    preconditions,
    reasonBrief: "Selected the selected-mark explanation plan.",
    fallbackPlan,
    ...(input.metadata ? { metadata: { ...input.metadata } } : {}),
    traceMetadata: buildSelectionTraceMetadata({
      input,
      status: "selected",
      plan: selectedPlan,
      reasonBrief: "Selected the selected-mark explanation plan.",
      fallbackPlan,
    }),
  };
}

function selectCurrentDashboardSummaryPlan(
  input: PlanSelectionInput,
  availablePlanIds: Set<PlanId>,
): PlanSelectionResult {
  const selectedPlan = createCurrentDashboardSummaryPlanDefinition(
    input.metadata,
  );
  const fallbackPlan = createUnsupportedPlanDefinition(input.metadata);

  if (!availablePlanIds.has(selectedPlan.id)) {
    return buildUnsupportedSelection(
      input,
      availablePlanIds,
      input.intentResolution.resolvedIntentId,
      "current_dashboard_summary plan is not available.",
    );
  }

  const preconditions = evaluatePlanPreconditions(
    selectedPlan,
    input.contextPack,
  );
  const failingPrecondition = preconditions.find(
    (precondition) => precondition.required && !precondition.satisfied,
  );

  if (failingPrecondition) {
    return {
      agentRunId: input.agentRunId,
      status: "fallback",
      matched: true,
      resolvedIntentId: input.intentResolution.resolvedIntentId,
      selectedPlan,
      preconditions,
      reasonBrief:
        failingPrecondition.fallbackReason ?? failingPrecondition.reasonBrief,
      fallbackPlan,
      ...(input.metadata ? { metadata: { ...input.metadata } } : {}),
      traceMetadata: buildSelectionTraceMetadata({
        input,
        status: "fallback",
        plan: selectedPlan,
        reasonBrief:
          failingPrecondition.fallbackReason ?? failingPrecondition.reasonBrief,
        fallbackPlan,
      }),
    };
  }

  return {
    agentRunId: input.agentRunId,
    status: "selected",
    matched: true,
    resolvedIntentId: input.intentResolution.resolvedIntentId,
    selectedPlan,
    preconditions,
    reasonBrief: "Selected the current dashboard summary plan.",
    fallbackPlan,
    ...(input.metadata ? { metadata: { ...input.metadata } } : {}),
    traceMetadata: buildSelectionTraceMetadata({
      input,
      status: "selected",
      plan: selectedPlan,
      reasonBrief: "Selected the current dashboard summary plan.",
      fallbackPlan,
    }),
  };
}

function buildUnsupportedSelection(
  input: PlanSelectionInput,
  availablePlanIds: Set<PlanId>,
  resolvedIntentId: IntentId,
  overrideReasonBrief?: string,
): PlanSelectionResult {
  const selectedPlan = createUnsupportedPlanDefinition(input.metadata);
  const preconditions = evaluatePlanPreconditions(
    selectedPlan,
    input.contextPack,
  );
  const reasonBrief =
    overrideReasonBrief ??
    (availablePlanIds.has(selectedPlan.id)
      ? "The resolved intent is not supported by the current fixed plan set."
      : "No fixed plan is available for the resolved intent.");

  return {
    agentRunId: input.agentRunId,
    status: "unsupported",
    matched: false,
    resolvedIntentId,
    selectedPlan,
    preconditions,
    reasonBrief,
    fallbackPlan: selectedPlan,
    unsupportedIntentId: resolvedIntentId,
    ...(input.metadata ? { metadata: { ...input.metadata } } : {}),
    traceMetadata: buildSelectionTraceMetadata({
      input,
      status: "unsupported",
      plan: selectedPlan,
      reasonBrief,
      fallbackPlan: selectedPlan,
    }),
  };
}

function buildSelectionTraceMetadata(input: {
  input: PlanSelectionInput;
  status: PlanSelectionStatus;
  plan: PlanDefinition;
  reasonBrief: string;
  fallbackPlan?: PlanDefinition;
}): PlanMetadata {
  const metadata: PlanMetadata = {
    agentRunId: input.input.agentRunId,
    intentId: input.input.intentResolution.resolvedIntentId,
    planId: input.plan.id,
    status: input.status,
    matched: input.status === "selected",
    reasonBrief: input.reasonBrief,
    budget: toRunBudgetMetadata(input.plan.budget),
    responseStrategy: input.plan.responseStrategy,
  };

  if (input.fallbackPlan) {
    metadata.fallbackPlanId = input.fallbackPlan.id;
  }

  metadata.preconditions = input.plan.preconditions.map((precondition) =>
    toPlanPreconditionMetadata(precondition),
  );

  return metadata;
}

function clonePlanDefinition(
  plan: PlanDefinition,
  metadata?: PlanMetadata,
): PlanDefinition {
  return {
    ...plan,
    requiredContextPacks: [...plan.requiredContextPacks],
    preconditions: plan.preconditions.map((precondition) => ({
      ...precondition,
      ...(precondition.metadata
        ? { metadata: { ...precondition.metadata } }
        : {}),
    })),
    allowedTools: [...plan.allowedTools],
    disallowedTools: [...plan.disallowedTools],
    toolPolicy: {
      mode: plan.toolPolicy.mode,
      allowedTools: [...plan.toolPolicy.allowedTools],
      disallowedTools: [...plan.toolPolicy.disallowedTools],
    },
    steps: plan.steps.map((step) => ({
      ...step,
      ...(step.input ? { input: { ...step.input } } : {}),
      ...(step.metadata ? { metadata: { ...step.metadata } } : {}),
    })),
    budget: { ...plan.budget },
    fallback:
      plan.fallback.kind === "fallback_to_plan"
        ? {
            kind: "fallback_to_plan" as const,
            planId: plan.fallback.planId,
            reasonBrief: plan.fallback.reasonBrief,
          }
        : {
            kind: "terminal" as const,
            reasonBrief: plan.fallback.reasonBrief,
            responseStrategy: plan.fallback.responseStrategy,
          },
    ...(plan.metadata || metadata
      ? {
          metadata: {
            ...(plan.metadata ?? {}),
            ...(metadata ?? {}),
          },
        }
      : {}),
  };
}

function getSelectedMarkCount(contextPack: ContextPack): number {
  const selectedMarks = contextPack.dashboardContext.selectedMarks;
  if (!selectedMarks) {
    return 0;
  }

  return selectedMarks.length;
}

function normalizeInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
): number {
  if (!Number.isFinite(value ?? Number.NaN)) {
    return fallback;
  }

  const normalized = Math.floor(value ?? fallback);
  if (normalized < minimum) {
    return fallback;
  }

  return normalized;
}

function isNonNegativeInteger(value: number | undefined): boolean {
  return Number.isInteger(value) && (value ?? -1) >= 0;
}

function isPositiveInteger(value: number | undefined): boolean {
  return Number.isInteger(value) && (value ?? 0) > 0;
}

function toRunBudgetMetadata(budget: RunBudget): PlanMetadata {
  const metadata: PlanMetadata = {
    maxModelCalls: budget.maxModelCalls,
    maxToolCalls: budget.maxToolCalls,
    timeoutMs: budget.timeoutMs,
  };

  if (budget.maxRetries !== undefined) {
    metadata.maxRetries = budget.maxRetries;
  }
  if (budget.maxContextItems !== undefined) {
    metadata.maxContextItems = budget.maxContextItems;
  }
  if (budget.maxSummaryRows !== undefined) {
    metadata.maxSummaryRows = budget.maxSummaryRows;
  }
  if (budget.maxSummaryColumns !== undefined) {
    metadata.maxSummaryColumns = budget.maxSummaryColumns;
  }

  return metadata;
}

function toPlanPreconditionMetadata(
  precondition: PlanPrecondition,
): PlanMetadata {
  const metadata: PlanMetadata = {
    id: precondition.id,
    type: precondition.type,
    required: precondition.required,
    reasonBrief: precondition.fallbackReason ?? precondition.description ?? "",
  };

  if (precondition.description) {
    metadata.description = precondition.description;
  }
  if (precondition.contextPackId) {
    metadata.contextPackId = precondition.contextPackId;
  }
  if (precondition.minSelectedMarks !== undefined) {
    metadata.minSelectedMarks = precondition.minSelectedMarks;
  }
  if (precondition.toolName) {
    metadata.toolName = precondition.toolName;
  }
  if (precondition.fallbackReason) {
    metadata.fallbackReason = precondition.fallbackReason;
  }
  if (precondition.metadata) {
    metadata.metadata = { ...precondition.metadata };
  }

  return metadata;
}
