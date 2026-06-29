import { describe, expect, it } from "vitest";
import {
  buildBudgetTraceMetadata,
  buildOrchestrationExecutionTraceMetadata,
  buildOrchestrationIntentResolutionTraceMetadata,
  buildPlanSelectionTraceMetadata,
  buildPlanStepTraceMetadata,
  buildOrchestrationToolRoutingTraceMetadata,
  createAgentRunId,
  createBudgetTraceEvent,
  createFallbackTraceEvent,
  createIntentEvidence,
  createIntentResolutionTraceEvent,
  createOrchestrationCompletedTraceEvent,
  createOrchestrationFailedTraceEvent,
  createOrchestrationStartedTraceEvent,
  createPlanSelectionTraceEvent,
  createPlanStepTraceEvent,
  createResolvedIntentResolution,
  createSelectedMarkExplanationPlanDefinition,
  createToolRoutingTraceEvent,
  createUnsupportedPlanDefinition,
  type ExecutionResult,
  type ExecutionStepResult,
  type OrchestrationTraceContextSummary,
  type PlanPreconditionResult,
  type PlanSelectionResult,
  type PlanStep,
  type ToolRoutingResult,
} from "../src/agent";

function createContextSummary(): OrchestrationTraceContextSummary {
  return {
    dashboardName: "Executive Overview",
    workbookName: "Sales Workbook",
    viewName: "Sales Trend",
    worksheetNames: [
      "Sales by Region",
      "Profit by Region",
      "Category Breakdown",
    ],
    selectedMarks: {
      hasSelectedMarks: true,
      totalCount: 42,
      previewCount: 20,
      truncated: true,
      worksheetCount: 3,
      worksheetNames: ["Sales by Region", "Profit by Region"],
    },
    summaryDataPreview: {
      worksheetCount: 2,
      rowCount: 1000,
      columnCount: 30,
      previewRowCount: 20,
      previewColumnCount: 20,
      truncated: true,
    },
  };
}

function createPlanSelectionResult(): PlanSelectionResult {
  const selectedPlan = createSelectedMarkExplanationPlanDefinition();
  const fallbackPlan = createUnsupportedPlanDefinition();
  const preconditions: PlanPreconditionResult[] = [
    {
      id: "requires_selected_marks",
      type: "requires_selected_marks",
      required: true,
      satisfied: true,
      reasonBrief: "Selected marks are available.",
      fallbackReason: "Selected marks are required.",
    },
  ];

  return {
    agentRunId: createAgentRunId(),
    status: "selected",
    matched: true,
    resolvedIntentId: "selected_mark_explanation",
    selectedPlan,
    preconditions,
    reasonBrief: "Selected the selected-mark explanation plan.",
    fallbackPlan,
    traceMetadata: {
      source: "unit-test",
    },
  };
}

function createToolRoutingResult(): ToolRoutingResult {
  const agentRunId = createAgentRunId();

  return {
    agentRunId,
    intentId: "selected_mark_explanation",
    planId: "selected_mark_explanation-v1",
    stepId: "collect-context",
    status: "allowed",
    toolName: "context.selectedMarks",
    reason: "Tool is allowed.",
    warnings: [],
    preconditionStatus: "passed",
    budgetStatus: {
      exceeded: false,
      maxToolCalls: 1,
      toolCallsUsed: 0,
    },
    traceMetadata: {
      router: "unit-test",
    },
  };
}

function createExecutionResult(): ExecutionResult {
  const agentRunId = createAgentRunId();
  const stepResults: ExecutionStepResult[] = Array.from(
    { length: 12 },
    (_, index) => ({
      stepId: `step-${index + 1}`,
      stepType: index % 2 === 0 ? "collect_context" : "call_tool",
      status: index === 0 ? "routed" : index === 1 ? "skipped" : "not_executed",
      ...(index === 1 ? { reason: "Step skipped." } : {}),
      ...(index === 0 ? { toolName: "context.selectedMarks" } : {}),
      warnings: index === 1 ? ["skipped"] : [],
      metadata: {
        huge: "x".repeat(1_000),
      },
      traceMetadata: {
        preview: index,
      },
    }),
  );

  return {
    agentRunId,
    status: "partial",
    planId: "selected_mark_explanation-v1",
    intentId: "selected_mark_explanation",
    executedSteps: ["step-1"],
    skippedSteps: ["step-2"],
    blockedSteps: [],
    stepResults,
    budgetUsage: {
      toolCallsUsed: 1,
      modelCallsUsed: 0,
      maxToolCalls: 1,
      maxModelCalls: 1,
      timeoutMs: 15_000,
      startedAt: "2026-06-30T00:00:00.000Z",
      completedAt: "2026-06-30T00:00:01.000Z",
      durationMs: 1_000,
    },
    warnings: ["partial_execution"],
    errors: [
      {
        message: "Tool routing was blocked.",
        stepId: "step-2",
        stepType: "call_tool",
      },
    ],
    fallbackReason: "Step execution is still a skeleton.",
    traceMetadata: {
      source: "unit-test",
    },
  };
}

describe("orchestration trace helpers", () => {
  it("creates orchestration lifecycle events", () => {
    const agentRunId = createAgentRunId();

    const started = createOrchestrationStartedTraceEvent({
      agentRunId,
      message: "Orchestration started.",
    });
    const completed = createOrchestrationCompletedTraceEvent({
      agentRunId,
      message: "Orchestration completed.",
    });
    const failed = createOrchestrationFailedTraceEvent({
      agentRunId,
      message: "Orchestration failed.",
    });

    expect(started.type).toBe("orchestration.started");
    expect(started.metadata?.eventState).toBe("started");
    expect(completed.type).toBe("orchestration.completed");
    expect(completed.metadata?.eventState).toBe("completed");
    expect(failed.type).toBe("orchestration.failed");
    expect(failed.metadata?.eventState).toBe("failed");
    expect(JSON.parse(JSON.stringify(started))).toEqual(started);
    expect(JSON.parse(JSON.stringify(completed))).toEqual(completed);
    expect(JSON.parse(JSON.stringify(failed))).toEqual(failed);
  });

  it("creates intent resolution trace events without oversized context payloads", () => {
    const agentRunId = createAgentRunId();
    const result = createResolvedIntentResolution({
      agentRunId,
      resolvedIntentId: "selected_mark_explanation",
      confidence: 0.99,
      source: "ui_action",
      reason: "The user clicked the explain action.",
      evidence: [
        createIntentEvidence("frontend_action", "explain_selection", {
          selectedMarkCount: 42,
        }),
      ],
    });
    const metadata = buildOrchestrationIntentResolutionTraceMetadata(result, {
      frontendActionId: "explain_selection",
      contextSummary: createContextSummary(),
    });

    const event = createIntentResolutionTraceEvent({
      agentRunId,
      type: "intent_resolution.completed",
      result,
      frontendActionId: "explain_selection",
      contextSummary:
        createContextSummary() as unknown as OrchestrationTraceContextSummary,
    });

    expect(metadata).toMatchObject({
      stage: "intent_resolution",
      intentId: "selected_mark_explanation",
      intentResolutionStatus: "resolved",
      intentResolutionSource: "ui_action",
      confidence: 0.99,
      frontendActionId: "explain_selection",
      contextSummary: {
        dashboardName: "Executive Overview",
      },
      evidenceCount: 1,
    });
    expect(event.metadata).toMatchObject({
      stage: "intent_resolution",
      intentId: "selected_mark_explanation",
      intentResolutionStatus: "resolved",
      intentResolutionSource: "ui_action",
      confidence: 0.99,
      frontendActionId: "explain_selection",
      contextSummary: {
        dashboardName: "Executive Overview",
        workbookName: "Sales Workbook",
        viewName: "Sales Trend",
        worksheetNames: [
          "Sales by Region",
          "Profit by Region",
          "Category Breakdown",
        ],
        selectedMarks: {
          hasSelectedMarks: true,
          totalCount: 42,
          previewCount: 20,
          truncated: true,
          worksheetCount: 3,
          worksheetNames: ["Sales by Region", "Profit by Region"],
        },
        summaryDataPreview: {
          worksheetCount: 2,
          rowCount: 1000,
          columnCount: 30,
          previewRowCount: 20,
          previewColumnCount: 20,
          truncated: true,
        },
      },
      evidenceCount: 1,
      eventState: "completed",
    });
    expect(JSON.parse(JSON.stringify(event))).toEqual(event);
  });

  it("creates plan selection trace metadata and plan selection events", () => {
    const selection = createPlanSelectionResult();
    const metadata = buildPlanSelectionTraceMetadata(selection, {
      contextSummary: createContextSummary(),
    });
    const event = createPlanSelectionTraceEvent({
      agentRunId: selection.agentRunId,
      type: "plan_selection.completed",
      selection,
      contextSummary: createContextSummary(),
    });

    expect(metadata).toMatchObject({
      stage: "plan_selection",
      planId: "selected_mark_explanation-v1",
      resultStatus: "selected",
      intentId: "selected_mark_explanation",
      selectedPlan: {
        planId: "selected_mark_explanation-v1",
        matched: true,
        reasonBrief: "Selected the selected-mark explanation plan.",
        fallbackPlanId: "unsupported-intent-v1",
      },
      preconditions: [
        {
          id: "requires_selected_marks",
          type: "requires_selected_marks",
          required: true,
          satisfied: true,
        },
      ],
      contextSummary: {
        dashboardName: "Executive Overview",
      },
    });
    expect(event.metadata?.planId).toBe("selected_mark_explanation-v1");
    expect(metadata.selectedPlan?.responseStrategy).toBe("explain_selection");
    expect(JSON.parse(JSON.stringify(event))).toEqual(event);
  });

  it("creates plan step trace metadata and events with summarized context", () => {
    const agentRunId = createAgentRunId();
    const step: PlanStep = {
      id: "collect-context",
      type: "collect_context",
      required: true,
      description: "Collect dashboard context.",
    };
    const hugeContext =
      createContextSummary() as unknown as OrchestrationTraceContextSummary;
    const metadata = buildPlanStepTraceMetadata({
      agentRunId,
      planId: "selected_mark_explanation-v1",
      intentId: "selected_mark_explanation",
      stepId: step.id,
      stepType: step.type,
      toolName: "context.selectedMarks",
      reason: "A required context step was blocked.",
      warnings: ["context_blocked"],
      contextSummary: hugeContext,
      metadata: {
        note: "unit-test",
      },
    });
    const event = createPlanStepTraceEvent({
      agentRunId,
      type: "plan_step.blocked",
      planId: "selected_mark_explanation-v1",
      intentId: "selected_mark_explanation",
      stepId: step.id,
      stepType: step.type,
      toolName: "context.selectedMarks",
      reason: "A required context step was blocked.",
      warnings: ["context_blocked"],
      contextSummary: hugeContext,
    });

    expect(metadata).toMatchObject({
      stage: "plan_step",
      stepId: "collect-context",
      stepType: "collect_context",
      toolName: "context.selectedMarks",
      routingReason: "A required context step was blocked.",
      warnings: ["context_blocked"],
    });
    expect(metadata.contextSummary?.selectedMarks).toMatchObject({
      totalCount: 42,
      previewCount: 20,
      truncated: true,
    });
    expect(
      (metadata.contextSummary?.selectedMarks as Record<string, unknown>)?.rows,
    ).toBeUndefined();
    expect(JSON.parse(JSON.stringify(event))).toEqual(event);
  });

  it("creates tool routing trace metadata and events", () => {
    const result = createToolRoutingResult();
    const metadata = buildOrchestrationToolRoutingTraceMetadata(result, {
      contextSummary: createContextSummary(),
    });
    const event = createToolRoutingTraceEvent({
      agentRunId: result.agentRunId,
      type: "tool_routing.completed",
      result,
      contextSummary: createContextSummary(),
    });

    expect(metadata).toMatchObject({
      stage: "tool_routing",
      toolName: "context.selectedMarks",
      toolRoutingStatus: "allowed",
      toolRoutingPreconditionStatus: "passed",
      routingReason: "Tool is allowed.",
      routingBudgetStatus: {
        exceeded: false,
        maxToolCalls: 1,
        toolCallsUsed: 0,
      },
      contextSummary: {
        dashboardName: "Executive Overview",
      },
    });
    expect(event.metadata?.eventState).toBe("completed");
    expect(JSON.parse(JSON.stringify(event))).toEqual(event);
  });

  it("creates budget and fallback trace metadata", () => {
    const agentRunId = createAgentRunId();
    const budgetMetadata = buildBudgetTraceMetadata({
      agentRunId,
      budget: {
        maxModelCalls: 1,
        maxToolCalls: 0,
        timeoutMs: 15_000,
      },
      budgetUsage: {
        modelCallsUsed: 1,
        toolCallsUsed: 0,
        startedAt: "2026-06-30T00:00:00.000Z",
        completedAt: "2026-06-30T00:00:01.000Z",
        durationMs: 1_000,
      },
    });
    const budgetEvent = createBudgetTraceEvent({
      agentRunId,
      budget: {
        maxModelCalls: 1,
        maxToolCalls: 0,
        timeoutMs: 15_000,
      },
      budgetUsage: {
        modelCallsUsed: 1,
        toolCallsUsed: 0,
        startedAt: "2026-06-30T00:00:00.000Z",
        completedAt: "2026-06-30T00:00:01.000Z",
        durationMs: 1_000,
      },
    });
    const fallbackEvent = createFallbackTraceEvent({
      agentRunId,
      fallbackReason: "No selected marks are available.",
      intentId: "unknown",
      planId: "unsupported-intent-v1",
      toolName: "context.selectedMarks",
      contextSummary: createContextSummary(),
    });

    expect(budgetMetadata).toMatchObject({
      stage: "budget",
      budget: {
        maxModelCalls: 1,
        maxToolCalls: 0,
        timeoutMs: 15_000,
      },
      budgetUsage: {
        modelCallsUsed: 1,
        toolCallsUsed: 0,
        durationMs: 1_000,
      },
    });
    expect(budgetEvent.type).toBe("budget.updated");
    expect(budgetEvent.metadata?.eventState).toBeUndefined();
    expect(fallbackEvent.type).toBe("fallback.selected");
    expect(fallbackEvent.metadata).toMatchObject({
      stage: "fallback",
      fallbackReason: "No selected marks are available.",
      intentId: "unknown",
      planId: "unsupported-intent-v1",
      toolName: "context.selectedMarks",
    });
    expect(JSON.parse(JSON.stringify(budgetEvent))).toEqual(budgetEvent);
    expect(JSON.parse(JSON.stringify(fallbackEvent))).toEqual(fallbackEvent);
  });

  it("summarizes execution trace metadata without leaking large bodies", () => {
    const result = createExecutionResult();
    const metadata = buildOrchestrationExecutionTraceMetadata(result, {
      contextSummary: createContextSummary(),
    });

    expect(metadata).toMatchObject({
      stage: "execution",
      executionStatus: "partial",
      planId: "selected_mark_explanation-v1",
      intentId: "selected_mark_explanation",
      executedStepCount: 1,
      skippedStepCount: 1,
      blockedStepCount: 0,
      errors: [
        {
          message: "Tool routing was blocked.",
          stepId: "step-2",
          stepType: "call_tool",
        },
      ],
      budgetUsage: {
        toolCallsUsed: 1,
        modelCallsUsed: 0,
        startedAt: "2026-06-30T00:00:00.000Z",
        completedAt: "2026-06-30T00:00:01.000Z",
        durationMs: 1_000,
      },
      fallbackReason: "Step execution is still a skeleton.",
    });
    expect(metadata.stepResults).toHaveLength(10);
    expect(metadata.stepResultsTruncated).toBe(true);
    expect(
      (metadata.stepResults?.[0] as Record<string, unknown>)?.metadata,
    ).toBeUndefined();
    expect(
      (metadata.stepResults?.[0] as Record<string, unknown>)?.traceMetadata,
    ).toBeUndefined();
    expect(JSON.parse(JSON.stringify(metadata))).toEqual(metadata);
  });
});
