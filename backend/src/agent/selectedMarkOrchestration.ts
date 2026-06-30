import type { AgentRunId } from "./runId";
import type { DashboardContext, SelectedMarkSummary } from "../types/tableau";
import { createDefaultExecutionEngine } from "./execution";
import { createDefaultIntentResolver } from "./minimalIntentResolver";
import {
  buildSelectedMarkExplanationPlaceholderResponse,
  buildSelectedMarkExplanationResponseMaterial,
  createSelectedMarkExplanationToolRuntime,
  type SelectedMarkExplanationResponseMaterial,
} from "./selectedMarkContextTools";
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
  createFallbackTraceEvent,
  createIntentResolutionTraceEvent,
  createOrchestrationCompletedTraceEvent,
  createOrchestrationFailedTraceEvent,
  createOrchestrationStartedTraceEvent,
  createOrchestrationTraceEvent,
  createPlanSelectionTraceEvent,
  type OrchestrationTraceContextSummary,
} from "./orchestrationTrace";

export type SelectedMarkOrchestrationResponse = {
  mode: "resolve_and_execute_fixed_plan";
  status: "completed" | "partial" | "fallback" | "failed";
  message: string;
  placeholderResponse: string;
  intentResolution: IntentResolutionResult;
  planSelection?: PlanSelectionResult;
  execution?: ExecutionResult;
  responseMaterial?: SelectedMarkExplanationResponseMaterial;
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

  const selectedMarkToolRuntime = createSelectedMarkExplanationToolRuntime(
    input.contextSummary,
  );
  const executionEngine = createDefaultExecutionEngine({
    toolRegistry: selectedMarkToolRuntime.registry,
    toolExecutionWrapper: selectedMarkToolRuntime.executionWrapper,
  });
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

  const responseMaterial =
    (execution.responseMaterial as
      | SelectedMarkExplanationResponseMaterial
      | undefined) ??
    buildSelectedMarkExplanationResponseMaterial({
      contextSummary: input.contextSummary,
      warnings: execution.warnings,
    });

  traceEvents.push(...execution.traceEvents);

  const response: SelectedMarkOrchestrationResponse = {
    mode: "resolve_and_execute_fixed_plan",
    status:
      execution.status === "failed"
        ? "failed"
        : execution.status === "partial"
          ? "partial"
          : "completed",
    message: buildSelectedMarkExplanationPlaceholderResponse(responseMaterial),
    placeholderResponse:
      buildSelectedMarkExplanationPlaceholderResponse(responseMaterial),
    intentResolution,
    planSelection: selection.planSelection,
    execution,
    responseMaterial,
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
    summaryDataPreview: contextSummary.summaryDataPreview
      ? {
          rowCount: contextSummary.summaryDataPreview.rowCount,
          columnCount: contextSummary.summaryDataPreview.columnCount,
          columnNames: contextSummary.summaryDataPreview.columnNames,
          truncated: contextSummary.summaryDataPreview.truncated,
        }
      : undefined,
    filters: contextSummary.filters
      ? {
          count: contextSummary.filters.count,
          names: contextSummary.filters.names,
        }
      : undefined,
    parameters: contextSummary.parameters
      ? {
          count: contextSummary.parameters.count,
          names: contextSummary.parameters.names,
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
    ...(traceSummary.summaryDataPreview
      ? { summaryDataPreview: traceSummary.summaryDataPreview }
      : {}),
    ...(traceSummary.filters ? { filters: traceSummary.filters } : {}),
    ...(traceSummary.parameters ? { parameters: traceSummary.parameters } : {}),
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
