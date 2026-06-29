import type { AgentRunId } from "./runId";
import type { DashboardContext, SelectedMarkSummary } from "../types/tableau";
import { createDefaultExecutionEngine } from "./execution";
import { createDefaultIntentResolver } from "./minimalIntentResolver";
import type {
  IntentResolutionContextSummary,
  IntentResolutionInput,
  IntentResolutionResult,
} from "./intent";
import { buildPlanSelection, type PlanSelectionResult } from "./plan";
import type { ContextPack, JsonObject, TraceEvent } from "./types";
import type { ExecutionResult } from "./execution";
import {
  buildExecutionTraceMetadata,
  buildIntentResolutionTraceMetadata,
  buildPlanSelectionTraceMetadata,
  createBudgetTraceEvent,
  createFallbackTraceEvent,
  createIntentResolutionTraceEvent,
  createOrchestrationCompletedTraceEvent,
  createOrchestrationFailedTraceEvent,
  createOrchestrationStartedTraceEvent,
  createOrchestrationTraceEvent,
  createPlanSelectionTraceEvent,
  createPlanStepTraceEvent,
  createToolRoutingTraceEvent,
  type OrchestrationTraceContextSummary,
} from "./orchestrationTrace";
import type { ToolRoutingResult } from "./toolRouter";

export type SelectedMarkOrchestrationResponse = {
  mode: "resolve_and_execute_fixed_plan";
  status: "completed" | "partial" | "fallback" | "failed";
  message: string;
  placeholderResponse: string;
  intentResolution: IntentResolutionResult;
  planSelection?: PlanSelectionResult;
  execution?: ExecutionResult;
  traceEvents: TraceEvent[];
  traceMetadata?: Record<string, unknown>;
  contextSummary?: OrchestrationTraceContextSummary;
};

export type SelectedMarkOrchestrationInput = {
  agentRunId?: AgentRunId;
  intentResolutionInput: IntentResolutionInput;
  contextSummary?: IntentResolutionContextSummary;
  metadata?: JsonObject;
};

export type SelectedMarkPlanSelection = {
  planSelection?: PlanSelectionResult;
  contextPack?: ContextPack;
  reasonBrief: string;
};

const STRUCTURED_ORCHESTRATION_MESSAGE =
  "Structured orchestration is connected for selected_mark_explanation. Actual AI response generation is not connected yet.";
const SELECT_MARKS_FIRST_MESSAGE =
  "Please select one or more marks before asking for an explanation.";

export async function runSelectedMarkExplanationOrchestration(
  input: SelectedMarkOrchestrationInput,
): Promise<SelectedMarkOrchestrationResponse> {
  const agentRunId: AgentRunId =
    input.agentRunId ?? input.intentResolutionInput.agentRunId;
  const contextSummary = buildTraceContextSummary(input.contextSummary);
  const traceEvents: TraceEvent[] = [
    createOrchestrationStartedTraceEvent({
      agentRunId,
      message: "Selected-mark orchestration started.",
      metadata: {
        stage: "orchestration",
        ...(input.intentResolutionInput.frontendActionId
          ? { frontendActionId: input.intentResolutionInput.frontendActionId }
          : {}),
        ...(contextSummary ? { contextSummary } : {}),
      },
    }),
  ];

  traceEvents.push(
    createOrchestrationTraceEvent({
      agentRunId,
      type: "intent_resolution.started",
      message: "Intent resolution started.",
      metadata: {
        stage: "intent_resolution",
        ...(input.intentResolutionInput.frontendActionId
          ? { frontendActionId: input.intentResolutionInput.frontendActionId }
          : {}),
        ...(contextSummary ? { contextSummary } : {}),
      },
    }),
  );

  const resolver = createDefaultIntentResolver();
  const intentResolution = await resolver.resolve(input.intentResolutionInput);

  traceEvents.push(
    createIntentResolutionTraceEvent({
      agentRunId,
      type: "intent_resolution.completed",
      result: intentResolution,
      frontendActionId: input.intentResolutionInput.frontendActionId,
      contextSummary,
    }),
  );

  if (intentResolution.resolvedIntentId !== "selected_mark_explanation") {
    return buildFallbackResponse({
      agentRunId,
      intentResolution,
      contextSummary,
      traceEvents,
      reasonBrief:
        intentResolution.reason ??
        "The selected-mark explanation intent could not be resolved.",
      placeholderResponse:
        "Structured orchestration could not resolve a selected-mark explanation request.",
      completedMessage: "Selected-mark orchestration completed with fallback.",
      metadata: input.intentResolutionInput.frontendActionId
        ? { frontendActionId: input.intentResolutionInput.frontendActionId }
        : undefined,
    });
  }

  const selection = selectFixedPlanForIntent({
    agentRunId,
    intentResolution,
    contextSummary: input.contextSummary,
    metadata: input.metadata,
  });

  if (!selection.planSelection) {
    return buildFallbackResponse({
      agentRunId,
      intentResolution,
      contextSummary,
      traceEvents,
      reasonBrief: selection.reasonBrief,
      placeholderResponse: SELECT_MARKS_FIRST_MESSAGE,
      completedMessage: "Selected-mark orchestration completed with fallback.",
      metadata: input.intentResolutionInput.frontendActionId
        ? { frontendActionId: input.intentResolutionInput.frontendActionId }
        : undefined,
    });
  }

  traceEvents.push(
    createOrchestrationTraceEvent({
      agentRunId,
      type: "plan_selection.started",
      message: "Plan selection started.",
      metadata: {
        stage: "plan_selection",
        intentId: intentResolution.resolvedIntentId,
        ...(contextSummary ? { contextSummary } : {}),
      },
    }),
  );

  traceEvents.push(
    createPlanSelectionTraceEvent({
      agentRunId,
      type: "plan_selection.completed",
      selection: selection.planSelection,
      contextSummary,
    }),
  );

  const executionEngine = createDefaultExecutionEngine();
  traceEvents.push(
    createOrchestrationTraceEvent({
      agentRunId,
      type: "execution.started",
      message: "Execution started.",
      metadata: {
        stage: "execution",
        planId: selection.planSelection.selectedPlan.id,
        intentId: intentResolution.resolvedIntentId,
        ...(contextSummary ? { contextSummary } : {}),
      },
    }),
  );

  const execution = await executionEngine.execute({
    agentRunId,
    intentResolution,
    plan: selection.planSelection.selectedPlan,
    selection: selection.planSelection,
    contextSummary: serializeOrchestrationContextSummary(input.contextSummary),
    metadata: input.metadata,
    traceMetadata: {
      stage: "execution",
      planSelection: selection.planSelection.traceMetadata ?? null,
      ...(contextSummary ? { contextSummary } : {}),
    },
  });

  traceEvents.push(
    ...buildExecutionTraceEvents({
      agentRunId,
      intentResolution,
      selection: selection.planSelection,
      execution,
      contextSummary,
    }),
  );

  const response: SelectedMarkOrchestrationResponse = {
    mode: "resolve_and_execute_fixed_plan",
    status: execution.status === "failed" ? "failed" : "completed",
    message: STRUCTURED_ORCHESTRATION_MESSAGE,
    placeholderResponse: STRUCTURED_ORCHESTRATION_MESSAGE,
    intentResolution,
    planSelection: selection.planSelection,
    execution,
    traceEvents: [
      ...traceEvents,
      execution.status === "failed"
        ? createOrchestrationFailedTraceEvent({
            agentRunId,
            message: "Selected-mark orchestration failed.",
            metadata: {
              stage: "orchestration",
              intentId: intentResolution.resolvedIntentId,
              planId: selection.planSelection.selectedPlan.id,
              resultStatus: execution.status,
            },
          })
        : createOrchestrationCompletedTraceEvent({
            agentRunId,
            message: "Selected-mark orchestration completed.",
            metadata: {
              stage: "orchestration",
              intentId: intentResolution.resolvedIntentId,
              planId: selection.planSelection.selectedPlan.id,
              resultStatus: execution.status,
            },
          }),
    ],
    traceMetadata: {
      intentResolution: buildIntentResolutionTraceMetadata(intentResolution, {
        frontendActionId: input.intentResolutionInput.frontendActionId,
        contextSummary,
      }),
      planSelection: buildPlanSelectionTraceMetadata(selection.planSelection, {
        contextSummary,
      }),
      execution: buildExecutionTraceMetadata(execution, {
        contextSummary,
      }),
    },
    contextSummary,
  };

  return response;
}

export function selectFixedPlanForIntent(input: {
  agentRunId: AgentRunId;
  contextSummary?: IntentResolutionContextSummary;
  metadata?: JsonObject;
  intentResolution: IntentResolutionResult;
}): SelectedMarkPlanSelection {
  if (input.intentResolution.resolvedIntentId !== "selected_mark_explanation") {
    return {
      reasonBrief:
        input.intentResolution.reason ??
        "The resolved intent does not map to the selected-mark fixed plan.",
    };
  }

  const selectedMarkCount =
    input.contextSummary?.selectedMarks?.totalCount ?? 0;
  if (selectedMarkCount <= 0) {
    return {
      reasonBrief:
        input.intentResolution.reason ??
        "Please select one or more marks before asking for an explanation.",
    };
  }

  const contextPack = buildOrchestrationContextPack(input.contextSummary, {
    agentRunId: input.agentRunId ?? input.intentResolution.agentRunId,
  });
  const planSelection = buildPlanSelection({
    agentRunId: input.agentRunId ?? input.intentResolution.agentRunId,
    intentResolution: input.intentResolution,
    contextPack,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });

  return {
    planSelection,
    contextPack,
    reasonBrief: planSelection.reasonBrief,
  };
}

function buildFallbackResponse(input: {
  agentRunId: AgentRunId;
  intentResolution: IntentResolutionResult;
  contextSummary?: OrchestrationTraceContextSummary;
  traceEvents: TraceEvent[];
  reasonBrief: string;
  placeholderResponse: string;
  completedMessage: string;
  metadata?: JsonObject;
}): SelectedMarkOrchestrationResponse {
  return {
    mode: "resolve_and_execute_fixed_plan",
    status: "fallback",
    message: input.reasonBrief,
    placeholderResponse: input.placeholderResponse,
    intentResolution: input.intentResolution,
    traceEvents: [
      ...input.traceEvents,
      createFallbackTraceEvent({
        agentRunId: input.agentRunId,
        fallbackReason: input.reasonBrief,
        intentId: input.intentResolution.resolvedIntentId,
        contextSummary: input.contextSummary,
      }),
      createOrchestrationCompletedTraceEvent({
        agentRunId: input.agentRunId,
        message: input.completedMessage,
        metadata: {
          stage: "orchestration",
          intentId: input.intentResolution.resolvedIntentId,
          resultStatus: "fallback",
        },
      }),
    ],
    traceMetadata: {
      orchestration: buildIntentResolutionTraceMetadata(
        input.intentResolution,
        {
          contextSummary: input.contextSummary,
          ...(input.metadata ? { metadata: input.metadata } : {}),
        },
      ),
    },
    contextSummary: input.contextSummary,
  };
}

function buildExecutionTraceEvents(input: {
  agentRunId: AgentRunId;
  intentResolution: IntentResolutionResult;
  selection: PlanSelectionResult;
  execution: ExecutionResult;
  contextSummary?: OrchestrationTraceContextSummary;
}): TraceEvent[] {
  const events: TraceEvent[] = [];

  for (const stepResult of input.execution.stepResults) {
    events.push(
      createPlanStepTraceEvent({
        agentRunId: input.agentRunId,
        type: mapPlanStepStatusToTraceEventType(stepResult.status),
        planId: input.selection.selectedPlan.id,
        intentId: input.intentResolution.resolvedIntentId,
        stepId: stepResult.stepId,
        stepType: stepResult.stepType,
        toolName: stepResult.toolName,
        reason: stepResult.reason,
        warnings: stepResult.warnings,
        contextSummary: input.contextSummary,
        metadata: stepResult.traceMetadata ?? stepResult.metadata,
      }),
    );

    if (
      stepResult.stepType === "call_tool" &&
      stepResult.routingStatus &&
      stepResult.toolName
    ) {
      const routingResult: ToolRoutingResult = {
        agentRunId: input.agentRunId,
        intentId: input.intentResolution.resolvedIntentId,
        planId: input.selection.selectedPlan.id,
        stepId: stepResult.stepId,
        status: mapRoutingStatus(stepResult.status, stepResult.routingStatus),
        toolName: stepResult.toolName,
        reason: stepResult.reason ?? "Tool routing completed.",
        warnings: [...stepResult.warnings],
        preconditionStatus: "unknown",
        budgetStatus: {
          exceeded: false,
          maxToolCalls: input.execution.budgetUsage.maxToolCalls,
          toolCallsUsed: input.execution.budgetUsage.toolCallsUsed,
        },
        ...(stepResult.traceMetadata
          ? { traceMetadata: { ...stepResult.traceMetadata } }
          : {}),
        ...(stepResult.metadata
          ? { metadata: { ...stepResult.metadata } }
          : {}),
      };

      events.push(
        createToolRoutingTraceEvent({
          agentRunId: input.agentRunId,
          type: mapRoutingTraceEventType(routingResult.status),
          result: routingResult,
          contextSummary: input.contextSummary,
        }),
      );
    }
  }

  events.push(
    createBudgetTraceEvent({
      agentRunId: input.agentRunId,
      budget: {
        maxModelCalls: input.execution.budgetUsage.maxModelCalls,
        maxToolCalls: input.execution.budgetUsage.maxToolCalls,
        timeoutMs: input.execution.budgetUsage.timeoutMs,
      },
      budgetUsage: input.execution.budgetUsage,
      ...(input.contextSummary
        ? { metadata: { contextSummary: input.contextSummary } }
        : {}),
    }),
  );

  return events;
}

function buildTraceContextSummary(
  contextSummary?: IntentResolutionContextSummary,
): OrchestrationTraceContextSummary | undefined {
  if (!contextSummary) {
    return undefined;
  }

  return {
    dashboardName: contextSummary.dashboardName,
    workbookName: contextSummary.workbookName,
    viewName: contextSummary.viewName,
    worksheetNames: contextSummary.worksheetNames,
    selectedMarks: contextSummary.selectedMarks
      ? {
          hasSelectedMarks: contextSummary.selectedMarks.hasSelectedMarks,
          totalCount: contextSummary.selectedMarks.totalCount,
          previewCount: contextSummary.selectedMarks.previewCount,
          truncated: contextSummary.selectedMarks.truncated,
          worksheetNames: contextSummary.selectedMarks.worksheetNames,
        }
      : undefined,
  };
}

function serializeOrchestrationContextSummary(
  contextSummary?: IntentResolutionContextSummary,
): JsonObject | undefined {
  const traceSummary = buildTraceContextSummary(contextSummary);
  if (!traceSummary) {
    return undefined;
  }

  return {
    dashboardName: traceSummary.dashboardName ?? null,
    workbookName: traceSummary.workbookName ?? null,
    viewName: traceSummary.viewName ?? null,
    worksheetNames: traceSummary.worksheetNames ?? [],
    ...(traceSummary.selectedMarks
      ? { selectedMarks: traceSummary.selectedMarks }
      : {}),
  };
}

function buildOrchestrationContextPack(
  contextSummary: IntentResolutionContextSummary | undefined,
  input: { agentRunId: AgentRunId },
): ContextPack {
  const selectedMarkCount = contextSummary?.selectedMarks?.totalCount ?? 0;
  const worksheetNames = contextSummary?.worksheetNames ?? [];
  const selectedMarks = Array.from({ length: selectedMarkCount }, (_, index) =>
    createSelectedMarkSummary(
      worksheetNames[index % Math.max(1, worksheetNames.length)],
      index,
    ),
  );

  return {
    agentRunId: input.agentRunId,
    createdAt: new Date().toISOString(),
    question: "Explain this selection.",
    dashboardContext: {
      dashboardName: contextSummary?.dashboardName ?? "Selected marks",
      workbookName: contextSummary?.workbookName ?? null,
      viewName: contextSummary?.viewName ?? null,
      worksheets: worksheetNames.map((name) => ({ name })),
      filters: [],
      parameters: [],
      selectedMarks,
      capturedAt: new Date().toISOString(),
    } as DashboardContext,
    clientContext: {
      source: "tableau-extension",
      appVersion: "orchestration",
    },
  };
}

function createSelectedMarkSummary(
  worksheetName: string | undefined,
  index: number,
): SelectedMarkSummary {
  return {
    worksheetName: worksheetName ?? `Worksheet ${index + 1}`,
    columns: ["Selected marks"],
    rowCount: 1,
    status: "available",
  };
}

function mapPlanStepStatusToTraceEventType(
  status: ExecutionResult["stepResults"][number]["status"],
): Parameters<typeof createPlanStepTraceEvent>[0]["type"] {
  switch (status) {
    case "routed":
      return "plan_step.completed";
    case "skipped":
      return "plan_step.skipped";
    case "blocked":
      return "plan_step.blocked";
    case "failed":
      return "plan_step.failed";
    case "not_executed":
    default:
      return "plan_step.started";
  }
}

function mapRoutingStatus(
  stepStatus: ExecutionResult["stepResults"][number]["status"],
  routingStatus: string,
): ToolRoutingResult["status"] {
  if (routingStatus === "allowed") {
    return "allowed";
  }
  if (routingStatus === "skipped") {
    return "skipped";
  }
  if (routingStatus === "unavailable") {
    return "unavailable";
  }
  if (stepStatus === "blocked") {
    return "blocked";
  }
  return "allowed";
}

function mapRoutingTraceEventType(
  status: ToolRoutingResult["status"],
): Parameters<typeof createToolRoutingTraceEvent>[0]["type"] {
  switch (status) {
    case "allowed":
      return "tool_routing.completed";
    case "skipped":
      return "tool_routing.skipped";
    case "blocked":
      return "tool_routing.blocked";
    case "unavailable":
    default:
      return "tool_routing.failed";
  }
}
