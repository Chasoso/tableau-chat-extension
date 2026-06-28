import { describe, expect, it, vi } from "vitest";
import {
  LambdaAgentRunner,
  createAgentRunId,
  createTraceEvent,
  type AgentRunner,
  type AgentRunInput,
} from "../src/agent";
import type { ChatService } from "../src/services/chatService";
import type { DashboardContext } from "../src/types/tableau";

function createDashboardContext(): DashboardContext {
  return {
    dashboardName: "Sales Overview",
    workbookName: "Sales Workbook",
    worksheets: [{ name: "Sales by Region" }],
    filters: [],
    parameters: [],
    capturedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("LambdaAgentRunner", () => {
  it("adapts ChatService into an AgentRunner on success", async () => {
    const agentRunId = createAgentRunId();
    const generateAnswer: ChatService["generateAnswer"] = vi.fn(
      async (request, authenticatedUser, options) => {
        expect(request).toEqual({
          question: "How are sales trending?",
          dashboardContext: createDashboardContext(),
          clientContext: {
            source: "tableau-extension",
            appVersion: "1.0.0",
          },
          sessionId: "session-1",
        });
        expect(authenticatedUser).toEqual({
          userId: "user-1",
          email: "user@example.com",
          tableauSubject: "tableau-subject",
          tokenUse: "id",
        });
        expect(options?.getRemainingTimeInMillis).toBeTypeOf("function");
        const remainingTime = options?.getRemainingTimeInMillis?.();
        expect(remainingTime).toBeGreaterThanOrEqual(0);
        expect(remainingTime).toBeLessThanOrEqual(1_000);

        return {
          answer: "Sales are up.",
          sessionId: "session-2",
          messageId: "message-1",
        };
      },
    );
    const runner: AgentRunner = new LambdaAgentRunner({
      generateAnswer,
    });
    const input: AgentRunInput = {
      agentRunId,
      userMessage: "How are sales trending?",
      contextPack: {
        agentRunId,
        createdAt: "2026-01-01T00:00:00.000Z",
        question: "How are sales trending?",
        dashboardContext: createDashboardContext(),
        sessionId: "session-1",
        clientContext: {
          source: "tableau-extension",
          appVersion: "1.0.0",
        },
        user: {
          userId: "user-1",
          email: "user@example.com",
          tableauSubject: "tableau-subject",
          tokenUse: "id",
        },
      },
      intent: {
        name: "data_analysis",
        confidence: 0.95,
        reasonBrief: "Analysis question.",
        answerableFromContext: true,
        needsMcp: false,
        maxToolCalls: 0,
        normalizedQuestion: "How are sales trending?",
      },
      plan: {
        agentRunId,
        intent: {
          name: "data_analysis",
          confidence: 0.95,
          reasonBrief: "Analysis question.",
          answerableFromContext: true,
          needsMcp: false,
          maxToolCalls: 0,
          normalizedQuestion: "How are sales trending?",
        },
        fixed: true,
        reasonBrief: "Context is enough.",
        requiredEvidence: ["dashboard_context"],
        steps: [
          {
            type: "inspect_context",
            description: "Inspect dashboard context.",
          },
        ],
        maxToolCalls: 0,
      },
      trace: [
        createTraceEvent({
          agentRunId,
          type: "context_normalized",
          message: "Context normalized",
        }),
      ],
      traceSink: {
        append: vi.fn(async () => undefined),
      },
      options: {
        budget: {
          timeoutMs: 1_000,
        },
        metadata: {
          source: "unit-test",
        },
      },
    };

    const result = await runner.run(input);

    expect(generateAnswer).toHaveBeenCalledTimes(1);
    expect(result.agentRunId).toBe(agentRunId);
    expect(result.status).toBe("completed");
    expect(result.answer).toBe("Sales are up.");
    expect(result.warnings).toEqual([]);
    expect(result.metadata).toEqual({
      sessionId: "session-2",
      messageId: "message-1",
      inputMetadata: {
        source: "unit-test",
      },
    });
    expect(result.trace.map((event) => event.type)).toEqual([
      "context_normalized",
      "run_started",
      "run_completed",
    ]);
    expect(result.trace.every((event) => event.agentRunId === agentRunId)).toBe(
      true,
    );
  });

  it("returns a failed result when ChatService throws", async () => {
    const agentRunId = createAgentRunId();
    const generateAnswer: ChatService["generateAnswer"] = vi.fn(async () => {
      throw new Error("bedrock unavailable");
    });
    const runner: AgentRunner = new LambdaAgentRunner({
      generateAnswer,
    });

    const result = await runner.run({
      agentRunId,
      userMessage: "How are sales trending?",
      contextPack: {
        agentRunId,
        createdAt: "2026-01-01T00:00:00.000Z",
        question: "How are sales trending?",
        dashboardContext: createDashboardContext(),
      },
      intent: {
        name: "data_analysis",
        confidence: 0.95,
        reasonBrief: "Analysis question.",
        answerableFromContext: true,
        needsMcp: false,
        maxToolCalls: 0,
        normalizedQuestion: "How are sales trending?",
      },
      plan: {
        agentRunId,
        intent: {
          name: "data_analysis",
          confidence: 0.95,
          reasonBrief: "Analysis question.",
          answerableFromContext: true,
          needsMcp: false,
          maxToolCalls: 0,
          normalizedQuestion: "How are sales trending?",
        },
        fixed: true,
        reasonBrief: "Context is enough.",
        requiredEvidence: ["dashboard_context"],
        steps: [],
        maxToolCalls: 0,
      },
      trace: [],
    });

    expect(generateAnswer).toHaveBeenCalledTimes(1);
    expect(result.agentRunId).toBe(agentRunId);
    expect(result.status).toBe("failed");
    expect(result.answer).toBeUndefined();
    expect(result.error).toEqual(
      expect.objectContaining({
        code: "CHAT_SERVICE_ERROR",
        message: "bedrock unavailable",
      }),
    );
    expect(result.trace.map((event) => event.type)).toEqual([
      "run_started",
      "run_failed",
    ]);
    expect(result.trace.every((event) => event.agentRunId === agentRunId)).toBe(
      true,
    );
  });
});
