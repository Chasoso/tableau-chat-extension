import { describe, expect, it } from "vitest";
import {
  createAgentRunId,
  createTraceEvent,
  type AgentRunId,
  type AgentRunContextSummary,
  type AgentRunInput,
  type AgentRunModelPolicy,
  type AgentRunObservability,
  type AgentRunResult,
  type AgentRunResultStatus,
  type AgentRunner,
  type AgentRunnerMetadata,
  type ContextPack,
} from "../src/agent";
import type { DashboardContext } from "../src/types/tableau";

function createDashboardContext(): DashboardContext {
  return {
    dashboardName: "Sales Overview",
    worksheets: [{ name: "Sales by Region" }],
    filters: [{ fieldName: "Region" }],
    parameters: [{ name: "Metric" }],
    capturedAt: "2026-01-01T00:00:00.000Z",
  };
}

function createSelectedMarkContext(): AgentRunContextSummary {
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
  };
}

function createLegacyContextPack(agentRunId: AgentRunId): ContextPack {
  return {
    agentRunId,
    createdAt: "2026-01-01T00:00:00.000Z",
    question: "Explain the selected marks.",
    dashboardContext: createDashboardContext(),
  };
}

function createTrace(agentRunId: AgentRunId) {
  return [
    createTraceEvent({
      agentRunId,
      kind: "run_started",
      message: "Run started",
    }),
  ];
}

describe("AgentRunner contract", () => {
  it("supports selected_mark_explanation comparison input and output shapes", async () => {
    const agentRunId = createAgentRunId();
    const input: AgentRunInput = {
      agentRunId,
      userMessage: "Explain the selected marks.",
      contextPack: createLegacyContextPack(agentRunId),
      trace: createTrace(agentRunId),
      intent: {
        name: "data_analysis",
        confidence: 0.92,
        reasonBrief: "The user asked for a selection explanation.",
        answerableFromContext: true,
        needsMcp: false,
        maxToolCalls: 0,
        normalizedQuestion: "Explain the selected marks.",
      },
      plan: {
        agentRunId,
        intent: {
          name: "data_analysis",
          confidence: 0.92,
          reasonBrief: "The user asked for a selection explanation.",
          answerableFromContext: true,
          needsMcp: false,
          maxToolCalls: 0,
          normalizedQuestion: "Explain the selected marks.",
        },
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
      },
      runMode: "selected_mark_explanation",
      requestedIntent: "selected_mark_explanation",
      actionId: "explain_selection",
      context: createSelectedMarkContext(),
      planHint: {
        planId: "selected_mark_explanation.fixed",
        planName: "Selected mark explanation fixed plan",
        fixed: true,
        reason: "Compare selected_mark_explanation runs consistently.",
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
      } satisfies AgentRunModelPolicy,
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
    };

    const runner = {
      async run(runInput): Promise<AgentRunResult> {
        const selectedMarksCount = runInput.context?.selectedMarks?.count ?? 0;
        return {
          agentRunId: runInput.agentRunId,
          runMode: runInput.runMode,
          status: "completed",
          answer: "Selected marks context was collected for comparison.",
          finalMessage: "Selected marks context was collected for comparison.",
          intent: {
            intentId: "selected_mark_explanation",
            intentName: "selected_mark_explanation",
            status: "resolved",
            confidence: 1,
            reason: "Explicit selection explanation request.",
            summary: {
              selectedMarksCount,
            },
          },
          plan: {
            planId: "selected_mark_explanation.fixed",
            planName: "Selected mark explanation fixed plan",
            status: "selected",
            summary: {
              requiredTools: 4,
            },
          },
          execution: {
            status: "completed",
            stepCount: 4,
            toolCallsUsed: 4,
            modelCallsUsed: 0,
            durationMs: 120,
            summary: {
              requiredContextCollected: true,
            },
          },
          response: {
            responseType: "deterministic_summary",
            message: "Selected marks context was collected.",
            summary: {
              intentId: "selected_mark_explanation",
              selectedMarks: selectedMarksCount,
            },
          },
          trace: runInput.trace,
          traceSummary: {
            eventCount: runInput.trace.length,
            summary: {
              firstEventType: runInput.trace[0]?.type,
              lastEventType: runInput.trace[runInput.trace.length - 1]?.type,
              hasErrors: false,
              hasToolExecution: false,
            },
            metadata: runInput.traceOptions?.traceId
              ? {
                  traceId: runInput.traceOptions.traceId,
                }
              : {},
          },
          warnings: [],
          errors: [],
          budgetUsage: {
            modelCallsUsed: 0,
            toolCallsUsed: 4,
            durationMs: 120,
            timedOut: false,
            estimatedCostUsd: 0,
          },
          runner: {
            kind: "test",
            name: "FakeAgentRunner",
            version: "1.0.0",
            implementation: "unit-test",
          } satisfies AgentRunnerMetadata,
          observability: {
            startedAt: "2026-01-01T00:00:00.000Z",
            completedAt: "2026-01-01T00:00:00.120Z",
            durationMs: 120,
            traceId: runInput.traceOptions?.traceId,
            correlationId: runInput.traceOptions?.correlationId,
            metrics: {
              latencyMs: 120,
              modelCalls: 0,
              toolCalls: 4,
              timeoutCount: 0,
              retryCount: 0,
            },
          } satisfies AgentRunObservability,
          startedAt: "2026-01-01T00:00:00.000Z",
          endedAt: "2026-01-01T00:00:00.120Z",
          metadata: {
            comparisonTarget: "selected_mark_explanation",
            source: "unit-test",
            runnerKind: "test",
          },
        };
      },
    } satisfies AgentRunner;

    const result = await runner.run(input);

    expect(result.agentRunId).toBe(agentRunId);
    expect(result.runMode).toBe("selected_mark_explanation");
    expect(result.status).toBe("completed");
    expect(result.finalMessage).toContain("Selected marks context");
    expect(result.response?.responseType).toBe("deterministic_summary");
    expect(result.traceSummary?.summary?.firstEventType).toBe("run_started");
    expect(result.runner?.kind).toBe("test");
    expect(result.observability?.durationMs).toBe(120);
    expect(JSON.stringify(result)).toContain("selected_mark_explanation");
  });

  it("supports comparison statuses and runner metadata for lambda and agentcore", () => {
    const lambdaRunId = createAgentRunId();
    const agentCoreRunId = createAgentRunId();
    const testRunId = createAgentRunId();
    const timeoutRunId = createAgentRunId();
    const sampleResults = [
      {
        agentRunId: lambdaRunId,
        runMode: "selected_mark_explanation",
        status: "completed",
        trace: [],
        warnings: [],
        startedAt: "2026-01-01T00:00:00.000Z",
        endedAt: "2026-01-01T00:00:00.010Z",
        runner: { kind: "lambda" },
      },
      {
        agentRunId: agentCoreRunId,
        runMode: "selected_mark_explanation",
        status: "fallback",
        trace: [],
        warnings: [
          {
            message: "No selected marks were available.",
            severity: "warning",
          },
        ],
        fallbackReason: "No selected marks were available.",
        startedAt: "2026-01-01T00:00:00.000Z",
        endedAt: "2026-01-01T00:00:00.010Z",
        runner: { kind: "agentcore" },
      },
      {
        agentRunId: testRunId,
        runMode: "selected_mark_explanation",
        status: "failed",
        trace: [],
        warnings: [],
        errors: [
          {
            message: "Timeout waiting for context tool.",
            recoverable: false,
          },
        ],
        startedAt: "2026-01-01T00:00:00.000Z",
        endedAt: "2026-01-01T00:00:00.010Z",
        runner: { kind: "test" },
      },
      {
        agentRunId: timeoutRunId,
        runMode: "selected_mark_explanation",
        status: "timed_out",
        trace: [],
        warnings: [],
        startedAt: "2026-01-01T00:00:00.000Z",
        endedAt: "2026-01-01T00:00:15.000Z",
        runner: { kind: "unknown" },
        observability: {
          cloudProviderRunId: "cloud-run-1",
          agentCoreSessionId: "agentcore-session-1",
        },
      },
    ] satisfies AgentRunResult[];

    const statuses = sampleResults.map((result) => result.status);
    const runnerKinds = sampleResults.map((result) => result.runner?.kind);

    expect(statuses).toEqual([
      "completed",
      "fallback",
      "failed",
      "timed_out",
    ] satisfies AgentRunResultStatus[]);
    expect(runnerKinds).toEqual(["lambda", "agentcore", "test", "unknown"]);
    expect(JSON.stringify(sampleResults)).toContain("timed_out");
  });
});
