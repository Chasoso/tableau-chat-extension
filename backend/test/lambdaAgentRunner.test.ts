import { describe, expect, it, vi } from "vitest";
import {
  LambdaAgentRunner,
  createAgentRunId,
  runSelectedMarkExplanationOrchestration,
  type AgentIntent,
  type AgentPlan,
  type AgentRunContextSummary,
  type AgentRunInput,
  type AgentRunner,
  type ContextPack,
  type SelectedMarkOrchestrationInput,
  type SelectedMarkOrchestrationResponse,
  type TraceEvent,
} from "../src/agent";

function createSelectedMarkContextSummary(
  overrides: Partial<AgentRunContextSummary> = {},
): AgentRunContextSummary {
  return {
    dashboardName: "Sales Overview",
    workbookName: "Sales Workbook",
    viewName: "Sales by Region",
    worksheetNames: ["Sales by Region"],
    selectedMarks: {
      available: true,
      count: 3,
      worksheetNames: ["Sales by Region"],
      fieldNames: ["Region", "Sales", "Profit"],
      summary: "3 marks selected across one worksheet.",
      truncated: false,
    },
    summaryDataPreview: {
      available: true,
      rowCount: 10,
      columnCount: 4,
      columnNames: ["Region", "Sales", "Profit", "Year"],
      truncated: true,
    },
    filters: {
      available: true,
      count: 2,
      names: ["Region", "Year"],
      truncated: false,
    },
    parameters: {
      available: true,
      count: 1,
      names: ["Metric"],
      truncated: false,
    },
    contextReference: "tableau://workbook/Sales Overview/view/Sales by Region",
    rawDataPolicy: {
      includeRawSelectedMarks: false,
      includeFullSummaryRows: false,
    },
    ...overrides,
  };
}

function createSelectedMarkAgentRunInput(
  overrides: Partial<AgentRunInput> = {},
): AgentRunInput {
  const agentRunId = overrides.agentRunId ?? createAgentRunId();
  return {
    agentRunId,
    userMessage: "Explain the selected marks.",
    runMode: "selected_mark_explanation",
    requestedIntent: "selected_mark_explanation",
    actionId: "explain_selection",
    context: createSelectedMarkContextSummary(),
    planHint: {
      planId: "selected_mark_explanation.fixed",
      planName: "Selected mark explanation fixed plan",
      fixed: true,
      reason: "Comparison test.",
    },
    toolPolicy: {
      allowedTools: [
        "context.selectedMarks",
        "context.summaryDataPreview",
        "context.filters",
        "context.parameters",
      ],
      disallowedTools: ["context.workbookMetadata"],
      safeForPreviewOnly: true,
      requiresExplicitActionAllowed: false,
    },
    modelPolicy: {
      provider: "none",
      modelId: "none",
      maxModelCalls: 0,
      allowLlmGeneration: false,
    },
    budget: {
      maxModelCalls: 0,
      maxToolCalls: 4,
      timeoutMs: 15_000,
      maxDurationMs: 20_000,
      maxEstimatedCostUsd: 0,
    },
    traceOptions: {
      traceId: "trace-selected-mark-explanation",
      correlationId: "corr-selected-mark-explanation",
      captureEvents: true,
      captureSummary: true,
      includeMetadata: true,
      metadata: {
        comparisonPhase: "v0.6.0",
      },
    },
    locale: "ja-JP",
    metadata: {
      comparisonTarget: "selected_mark_explanation",
      source: "unit-test",
    },
    contextPack: createLegacyContextPack(agentRunId),
    intent: createLegacyIntent(),
    plan: createLegacyPlan(agentRunId),
    trace: [] as TraceEvent[],
    ...overrides,
  };
}

function createLegacyContextPack(
  agentRunId: AgentRunInput["agentRunId"],
): ContextPack {
  return {
    agentRunId,
    createdAt: "2026-01-01T00:00:00.000Z",
    question: "Explain the selected marks.",
    dashboardContext: {
      dashboardName: "Sales Overview",
      workbookName: "Sales Workbook",
      viewName: "Sales by Region",
      worksheets: [{ name: "Sales by Region" }],
      filters: [{ fieldName: "Region" }],
      parameters: [{ name: "Metric" }],
      selectedMarks: [
        {
          worksheetName: "Sales by Region",
          columns: ["Region", "Sales", "Profit"],
          rowCount: 3,
          status: "available",
        },
      ],
      capturedAt: "2026-01-01T00:00:00.000Z",
    },
  };
}

function createLegacyIntent(): AgentIntent {
  return {
    name: "data_analysis",
    confidence: 0.92,
    reasonBrief: "The user asked for a selection explanation.",
    answerableFromContext: true,
    needsMcp: false,
    maxToolCalls: 0,
    normalizedQuestion: "Explain the selected marks.",
  };
}

function createLegacyPlan(agentRunId: AgentRunInput["agentRunId"]): AgentPlan {
  return {
    agentRunId,
    intent: createLegacyIntent(),
    fixed: true,
    reasonBrief: "The selected-mark path is deterministic.",
    requiredEvidence: ["selected_marks", "summary_data_preview"],
    steps: [
      {
        type: "inspect_context",
        description: "Inspect the selected marks context.",
      },
    ],
    maxToolCalls: 4,
  };
}

function createFallbackOrchestrationResponse(
  agentRunId: AgentRunInput["agentRunId"],
): SelectedMarkOrchestrationResponse {
  return {
    mode: "resolve_and_execute_fixed_plan",
    status: "fallback",
    message: "Select one or more marks before asking for an explanation.",
    placeholderResponse:
      "Select one or more marks in the Tableau view before asking for an explanation.",
    intentResolution: {
      agentRunId,
      status: "resolved",
      resolvedIntentId: "selected_mark_explanation",
      confidence: 0.99,
      source: "deterministic_rule",
      reason: "Selected marks are missing.",
      evidence: [],
      warnings: [],
      metadata: {
        source: "unit-test",
      },
    },
    traceEvents: [],
  };
}

describe("LambdaAgentRunner", () => {
  it("supports selected_mark_explanation comparison input and output shapes", async () => {
    const agentRunId = createAgentRunId();
    const runSelectedMarkExplanation = vi.fn(
      async (input: SelectedMarkOrchestrationInput) => {
        expect(input.agentRunId).toBe(agentRunId);
        expect(input.intentResolutionInput.requestedIntentId).toBe(
          "selected_mark_explanation",
        );
        expect(input.intentResolutionInput.frontendActionId).toBe(
          "explain_selection",
        );
        expect(input.intentResolutionInput.message).toBe(
          "Explain the selected marks.",
        );
        expect(input.intentResolutionInput.contextSummary).toMatchObject({
          dashboardName: "Sales Overview",
          selectedMarks: {
            totalCount: 3,
            previewCount: 3,
            worksheetNames: ["Sales by Region"],
          },
          summaryDataPreview: {
            available: true,
            rowCount: 10,
          },
        });
        expect(input.intentResolutionInput.traceMetadata).toMatchObject({
          runnerKind: "lambda",
          runnerName: "LambdaAgentRunner",
          traceId: "trace-selected-mark-explanation",
          correlationId: "corr-selected-mark-explanation",
          locale: "ja-JP",
        });
        expect(input.metadata).toMatchObject({
          comparisonTarget: "selected_mark_explanation",
          source: "unit-test",
        });

        return createFallbackOrchestrationResponse(agentRunId);
      },
    );

    const runner: AgentRunner = new LambdaAgentRunner({
      runSelectedMarkExplanation,
    });

    const result = await runner.run(
      createSelectedMarkAgentRunInput({ agentRunId }),
    );

    expect(runSelectedMarkExplanation).toHaveBeenCalledTimes(1);
    expect(result.agentRunId).toBe(agentRunId);
    expect(result.runMode).toBe("selected_mark_explanation");
    expect(result.status).toBe("fallback");
    expect(result.finalMessage).toContain("Select one or more marks");
    expect(result.answer).toContain("Select one or more marks");
    expect(result.runner).toMatchObject({
      kind: "lambda",
      name: "LambdaAgentRunner",
    });
    expect(result.observability).toMatchObject({
      durationMs: expect.any(Number),
      traceId: "trace-selected-mark-explanation",
      correlationId: "corr-selected-mark-explanation",
    });
    expect(result.budgetUsage).toMatchObject({
      modelCallsUsed: 0,
      toolCallsUsed: 0,
      timedOut: false,
    });
    expect(result.traceSummary).toMatchObject({
      eventCount: 2,
      summary: {
        firstEventType: "run_started",
        lastEventType: "run_completed",
        hasErrors: false,
        hasToolExecution: false,
      },
    });
    expect(result.metadata).toMatchObject({
      runnerKind: "lambda",
      runnerName: "LambdaAgentRunner",
      resultStatus: "fallback",
      runMode: "selected_mark_explanation",
      requestedIntent: "selected_mark_explanation",
      locale: "ja-JP",
      fallbackReason:
        "Select one or more marks before asking for an explanation.",
    });
    expect(JSON.stringify(result)).toContain("selected_mark_explanation");
  });

  it("returns a safe fallback result for unsupported run modes", async () => {
    const runSelectedMarkExplanation = vi.fn();
    const runner = new LambdaAgentRunner({
      runSelectedMarkExplanation,
    });

    const result = await runner.run(
      createSelectedMarkAgentRunInput({
        runMode: "freeform_chat",
        requestedIntent: "freeform_chat",
      }),
    );

    expect(runSelectedMarkExplanation).not.toHaveBeenCalled();
    expect(result.status).toBe("fallback");
    expect(result.fallbackReason).toContain("selected_mark_explanation only");
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: "UNSUPPORTED_RUN_MODE",
        source: "LambdaAgentRunner",
      }),
    ]);
    expect(result.runner).toMatchObject({ kind: "lambda" });
    expect(JSON.stringify(result)).toContain("UNSUPPORTED_RUN_MODE");
  });

  it("wraps the real selected_mark_explanation orchestration path", async () => {
    const agentRunId = createAgentRunId();
    const result = await new LambdaAgentRunner({
      runSelectedMarkExplanation: runSelectedMarkExplanationOrchestration,
    }).run(createSelectedMarkAgentRunInput({ agentRunId }));

    expect(result.agentRunId).toBe(agentRunId);
    expect(result.status).toBe("partial");
    expect(result.response?.responseType).toBe("deterministic_summary");
    expect(result.finalMessage).toContain("Selected marks:");
    expect(result.traceSummary?.eventCount).toBeGreaterThan(0);
    expect(result.budgetUsage?.toolCallsUsed).toBeGreaterThanOrEqual(0);
    expect(result.metadata).toMatchObject({
      runnerKind: "lambda",
      runnerName: "LambdaAgentRunner",
      resultStatus: "partial",
    });
    expect(JSON.stringify(result)).toContain("Selected marks:");
  });

  it("returns a safe fallback when selected marks are missing", async () => {
    const agentRunId = createAgentRunId();
    const result = await new LambdaAgentRunner({
      runSelectedMarkExplanation: runSelectedMarkExplanationOrchestration,
    }).run(
      createSelectedMarkAgentRunInput({
        agentRunId,
        context: createSelectedMarkContextSummary({
          selectedMarks: {
            available: false,
            count: 0,
            worksheetNames: [],
            fieldNames: [],
            summary: "No selected marks are available.",
            truncated: false,
          },
        }),
      }),
    );

    expect(result.status).toBe("fallback");
    expect(result.fallbackReason).toContain(
      "selected_mark_explanation requires",
    );
    expect(result.response?.responseType).toBe("placeholder");
    expect(result.finalMessage).toContain("selected-mark explanation request");
    expect(result.traceSummary?.summary?.hasToolExecution).toBe(false);
    expect(JSON.stringify(result)).not.toContain('"rows"');
    expect(JSON.stringify(result)).not.toContain('"values"');
  });
});
