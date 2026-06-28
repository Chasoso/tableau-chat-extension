import { describe, expect, it } from "vitest";
import {
  createAgentRunId,
  createTraceEvent,
  type AgentIntent,
  type AgentPlan,
  type AgentRunner,
  type AgentRunInput,
  type AgentRunResult,
  type ContextPack,
} from "../src/agent";
import type { DashboardContext } from "../src/types/tableau";

function createDashboardContext(): DashboardContext {
  return {
    dashboardName: "Sales Overview",
    worksheets: [{ name: "Sales by Region" }],
    filters: [],
    parameters: [],
    capturedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("agent runner interface", () => {
  it("describes a swappable run contract", async () => {
    const agentRunId = createAgentRunId();
    const contextPack: ContextPack = {
      agentRunId,
      createdAt: "2026-01-01T00:00:00.000Z",
      question: "How are sales trending?",
      dashboardContext: createDashboardContext(),
    };
    const intent: AgentIntent = {
      name: "data_analysis",
      confidence: 0.92,
      reasonBrief: "The question asks about trend analysis.",
      answerableFromContext: true,
      needsMcp: false,
      maxToolCalls: 0,
      normalizedQuestion: "How are sales trending?",
    };
    const plan: AgentPlan = {
      agentRunId,
      intent,
      fixed: true,
      reasonBrief: "The context already answers the question.",
      requiredEvidence: ["dashboard_context"],
      steps: [
        {
          type: "inspect_context",
          description: "Review dashboard context.",
        },
      ],
      maxToolCalls: 0,
    };
    const trace = [
      createTraceEvent({
        agentRunId,
        kind: "run_started",
        message: "Run started",
      }),
    ];

    const input = {
      agentRunId,
      userMessage: "How are sales trending?",
      contextPack,
      intent,
      plan,
      trace,
      traceSink: {
        append: async () => undefined,
      },
      options: {
        budget: {
          maxModelCalls: 1,
          maxToolCalls: 0,
          timeoutMs: 5_000,
        },
        metadata: {
          source: "unit-test",
        },
      },
    } satisfies AgentRunInput;

    const runner = {
      async run(runInput) {
        return {
          agentRunId: runInput.agentRunId,
          status: "completed",
          answer: "Sales are up.",
          trace: runInput.trace,
          warnings: [],
          startedAt: "2026-01-01T00:00:00.000Z",
          endedAt: "2026-01-01T00:00:01.000Z",
          metadata: {
            runner: "mock",
          },
        };
      },
    } satisfies AgentRunner;

    const result = await runner.run(input);

    expect(result).toEqual({
      agentRunId,
      status: "completed",
      answer: "Sales are up.",
      trace,
      warnings: [],
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: "2026-01-01T00:00:01.000Z",
      metadata: {
        runner: "mock",
      },
    } satisfies AgentRunResult);
  });
});
