import { describe, expect, it } from "vitest";
import {
  buildBudgetTraceMetadata,
  buildOrchestrationExecutionTraceMetadata,
  buildOrchestrationIntentResolutionTraceMetadata,
  buildPlanSelectionTraceMetadata,
  buildPlanStepTraceMetadata,
  buildToolExecutionTraceEventMetadata,
  buildToolPreconditionTraceMetadata,
  buildToolRegistryTraceMetadata,
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
  createToolExecutionTraceEvent,
  createToolPreconditionTraceEvent,
  createToolRegistryTraceEvent,
  createResolvedIntentResolution,
  createToolDefinitionSummary,
  createSelectedMarkExplanationPlanDefinition,
  createToolRoutingTraceEvent,
  createUnsupportedPlanDefinition,
  type ExecutionResult,
  type ExecutionStepResult,
  type OrchestrationTraceContextSummary,
  type PlanPreconditionResult,
  type PlanSelectionResult,
  type PlanStep,
  type ToolDefinition,
  type ToolExecutionResult,
  type ToolLookupResult,
  type ToolPreconditionResult,
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
    traceEvents: [],
    traceMetadata: {
      source: "unit-test",
    },
  };
}

function createToolSummary() {
  const definition: ToolDefinition = {
    name: "context.selectedMarks",
    description: "Reads selected marks from orchestration context.",
    category: "context",
    capabilities: ["read_context", "read_selected_marks"],
    safety: {
      level: "read_only",
      safeForPreview: true,
      requiresExplicitAction: false,
      mayAccessSelectedMarks: true,
    },
    availability: {
      status: "available",
    },
    inputSchema: {
      kind: "typescript_contract",
      description: "Uses the orchestration context reference.",
      requiredFields: ["contextSummary"],
    },
    outputSchema: {
      kind: "typescript_contract",
      description: "Returns a limited selected mark summary.",
      requiredFields: ["selectedMarkCount"],
    },
    version: "1.0.0",
    metadata: {
      source: "unit-test",
    },
  };

  return createToolDefinitionSummary(definition);
}

function createToolLookupResult(
  status: ToolLookupResult["status"],
): ToolLookupResult {
  const tool = createToolSummary();

  switch (status) {
    case "found":
      return {
        status,
        toolName: tool.name,
        tool,
        reason: "Tool is registered and available.",
        warnings: ["lookup_ok"],
        metadata: {
          policyDecision: "allow",
          accessToken: "secret-value",
        },
        traceMetadata: {
          source: "unit-test",
        },
      };
    case "missing":
      return {
        status,
        toolName: "context.summaryDataPreview",
        reason: "Tool is not registered.",
        warnings: ["lookup_missing"],
        metadata: {
          accessToken: "secret-value",
        },
      };
    case "unavailable":
      return {
        status,
        toolName: "context.summaryDataPreview",
        reason: "Tool is unavailable.",
        warnings: ["lookup_unavailable"],
        metadata: {
          availabilityReason: "temporarily-disabled",
        },
      };
    case "disallowed":
      return {
        status,
        toolName: "context.summaryDataPreview",
        reason: "Tool is disallowed by policy.",
        warnings: ["lookup_disallowed"],
        metadata: {
          policyDecision: "disallow",
        },
      };
  }
}

function createToolPreconditionResult(
  status: ToolPreconditionResult["status"],
): ToolPreconditionResult {
  return {
    id: "selected_marks.required",
    type: "requires_selected_marks",
    status,
    required: true,
    reason:
      status === "passed"
        ? "Selected marks are available."
        : "Selected marks are required.",
    warnings: status === "passed" ? [] : ["selected_marks_missing"],
    metadata: {
      selectedMarkCount: status === "passed" ? 42 : 0,
      accessToken: "secret-value",
    },
    evaluatedAt: "2026-06-30T00:00:00.000Z",
  };
}

function createToolExecutionResult(
  status: ToolExecutionResult["status"],
): ToolExecutionResult {
  return {
    status,
    toolName: "context.selectedMarks",
    jsonSafe: true,
    ...(status === "completed"
      ? {
          output: {
            selectedMarkCount: 42,
            items: Array.from(
              { length: 20 },
              (_, index) => `item-${index + 1}`,
            ),
          },
          normalizedOutput: {
            selectedMarkCount: 42,
            items: Array.from(
              { length: 20 },
              (_, index) => `item-${index + 1}`,
            ),
          },
          jsonSafe: true,
        }
      : {}),
    ...(status === "failed"
      ? {
          error: {
            name: "ToolExecutionError",
            message: "Tool execution failed.",
            stack:
              "ToolExecutionError: Tool execution failed.\n at test.ts:1:1",
          },
          jsonSafe: true,
        }
      : {}),
    warnings: status === "completed" ? [] : ["tool_issue"],
    durationMs: 123,
    timeoutMs: 3_000,
    budgetUsage: {
      toolCallsUsed: status === "completed" ? 1 : 0,
      toolCallsRemaining: status === "completed" ? 0 : 1,
      maxToolCalls: 1,
    },
    preconditionSummary: {
      results: [
        {
          id: "selected_marks.required",
          type: "requires_selected_marks",
          status: "passed",
          required: true,
        },
      ],
    },
    routingSummary: {
      status: "allowed",
      reason: "Tool is allowed.",
    },
    metadata: {
      accessToken: "secret-value",
    },
    traceMetadata: {
      source: "unit-test",
    },
    normalization: {
      jsonSafe: true,
      truncated: status === "completed",
      circularReferenceCount: 0,
      depthExceeded: false,
      replacedValueCount: 0,
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

  it("creates tool registry trace metadata and events without leaking raw metadata", () => {
    const found = createToolLookupResult("found");
    const missing = createToolLookupResult("missing");
    const unavailable = createToolLookupResult("unavailable");
    const disallowed = createToolLookupResult("disallowed");

    const foundMetadata = buildToolRegistryTraceMetadata(found, {
      contextSummary: createContextSummary(),
    });
    const foundEvent = createToolRegistryTraceEvent({
      agentRunId: createAgentRunId(),
      type: "tool_registry.lookup",
      result: found,
      contextSummary: createContextSummary(),
    });
    const missingEvent = createToolRegistryTraceEvent({
      agentRunId: createAgentRunId(),
      type: "tool_registry.lookup",
      result: missing,
    });

    expect(foundMetadata).toMatchObject({
      toolName: "context.selectedMarks",
      category: "context",
      lookupStatus: "found",
      availabilityStatus: "available",
      reason: "Tool is registered and available.",
      safety: {
        level: "read_only",
        safeForPreview: true,
        requiresExplicitAction: false,
      },
      contextSummary: {
        dashboardName: "Executive Overview",
      },
      metadata: {
        policyDecision: "allow",
        accessToken: "[REDACTED]",
      },
    });
    expect(foundEvent.type).toBe("tool_registry.lookup");
    expect(foundEvent.metadata?.lookupStatus).toBe("found");
    expect(foundEvent.metadata?.metadata).toMatchObject({
      accessToken: "[REDACTED]",
    });
    expect(JSON.parse(JSON.stringify(foundEvent))).toEqual(foundEvent);

    expect(buildToolRegistryTraceMetadata(missing)).toMatchObject({
      toolName: "context.summaryDataPreview",
      lookupStatus: "missing",
      reason: "Tool is not registered.",
      metadata: {
        accessToken: "[REDACTED]",
      },
    });
    expect(buildToolRegistryTraceMetadata(unavailable)).toMatchObject({
      toolName: "context.summaryDataPreview",
      lookupStatus: "unavailable",
      reason: "Tool is unavailable.",
    });
    expect(buildToolRegistryTraceMetadata(disallowed)).toMatchObject({
      toolName: "context.summaryDataPreview",
      lookupStatus: "disallowed",
      reason: "Tool is disallowed by policy.",
      policyDecision: "disallow",
    });
    expect(missingEvent.metadata?.eventState).toBeUndefined();
    expect(JSON.parse(JSON.stringify(missingEvent))).toEqual(missingEvent);
  });

  it("creates tool precondition trace metadata and events", () => {
    const passed = createToolPreconditionResult("passed");
    const failed = createToolPreconditionResult("failed");

    const passedMetadata = buildToolPreconditionTraceMetadata(passed, {
      toolName: "context.selectedMarks",
      contextSummary: createContextSummary(),
    });
    const failedEvent = createToolPreconditionTraceEvent({
      agentRunId: createAgentRunId(),
      type: "tool_precondition.failed",
      result: failed,
      toolName: "context.selectedMarks",
      contextSummary: createContextSummary(),
    });
    const passedEvent = createToolPreconditionTraceEvent({
      agentRunId: createAgentRunId(),
      type: "tool_precondition.passed",
      result: passed,
      toolName: "context.selectedMarks",
    });

    expect(passedMetadata).toMatchObject({
      toolName: "context.selectedMarks",
      preconditionId: "selected_marks.required",
      preconditionType: "requires_selected_marks",
      preconditionStatus: "passed",
      required: true,
      reason: "Selected marks are available.",
      contextSummary: {
        dashboardName: "Executive Overview",
      },
      metadata: {
        selectedMarkCount: 42,
        accessToken: "[REDACTED]",
      },
    });
    expect(failedEvent.type).toBe("tool_precondition.failed");
    expect(failedEvent.metadata?.preconditionStatus).toBe("failed");
    expect(passedEvent.type).toBe("tool_precondition.passed");
    expect(passedEvent.metadata?.preconditionStatus).toBe("passed");
    expect(JSON.parse(JSON.stringify(failedEvent))).toEqual(failedEvent);
    expect(JSON.parse(JSON.stringify(passedEvent))).toEqual(passedEvent);
  });

  it("creates tool execution trace metadata and events without leaking outputs", () => {
    const completed = createToolExecutionResult("completed");
    const failed = createToolExecutionResult("failed");
    const startedEvent = createToolExecutionTraceEvent({
      agentRunId: createAgentRunId(),
      type: "tool_execution.started",
      toolName: "context.selectedMarks",
    });
    const completedMetadata = buildToolExecutionTraceEventMetadata(completed, {
      toolName: "context.selectedMarks",
      contextSummary: createContextSummary(),
    });
    const completedEvent = createToolExecutionTraceEvent({
      agentRunId: createAgentRunId(),
      type: "tool_execution.completed",
      result: completed,
      toolName: "context.selectedMarks",
      contextSummary: createContextSummary(),
    });
    const failedEvent = createToolExecutionTraceEvent({
      agentRunId: createAgentRunId(),
      type: "tool_execution.failed",
      result: failed,
      toolName: "context.selectedMarks",
    });

    expect(startedEvent.type).toBe("tool_execution.started");
    expect(startedEvent.metadata?.toolName).toBe("context.selectedMarks");
    expect(completedMetadata).toMatchObject({
      toolName: "context.selectedMarks",
      toolExecutionStatus: "completed",
      durationMs: 123,
      timeoutMs: 3_000,
      budgetUsage: {
        toolCallsUsed: 1,
        toolCallsRemaining: 0,
        maxToolCalls: 1,
      },
      outputSummary: {
        kind: "object",
        itemCount: 2,
        truncated: true,
        jsonSafe: true,
      },
      errorSummary: undefined,
      metadata: {
        accessToken: "[REDACTED]",
      },
      contextSummary: {
        dashboardName: "Executive Overview",
      },
    });
    expect(completedEvent.type).toBe("tool_execution.completed");
    expect(
      (
        completedEvent.metadata as
          | {
              toolExecutionStatus?: string;
              outputSummary?: { truncated?: boolean };
              metadata?: { accessToken?: string };
            }
          | undefined
      )?.toolExecutionStatus,
    ).toBe("completed");
    expect(
      (
        completedEvent.metadata as
          | {
              outputSummary?: { truncated?: boolean };
            }
          | undefined
      )?.outputSummary?.truncated,
    ).toBe(true);
    expect(
      (
        completedEvent.metadata as
          | {
              metadata?: { accessToken?: string };
            }
          | undefined
      )?.metadata,
    ).toMatchObject({
      accessToken: "[REDACTED]",
    });
    expect(failedEvent.type).toBe("tool_execution.failed");
    expect(
      (
        failedEvent.metadata as
          | {
              toolExecutionStatus?: string;
            }
          | undefined
      )?.toolExecutionStatus,
    ).toBe("failed");
    expect(failedEvent.metadata?.errorSummary).toMatchObject({
      name: "ToolExecutionError",
      message: "Tool execution failed.",
    });
    expect(JSON.parse(JSON.stringify(startedEvent))).toEqual(startedEvent);
    expect(JSON.parse(JSON.stringify(completedEvent))).toEqual(completedEvent);
    expect(JSON.parse(JSON.stringify(failedEvent))).toEqual(failedEvent);
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
