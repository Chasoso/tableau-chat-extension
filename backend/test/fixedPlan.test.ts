import { describe, expect, it } from "vitest";
import {
  buildFixedPlan,
  CURRENT_DASHBOARD_SUMMARY_PLAN,
  createAgentRunId,
  type BuildFixedPlanInput,
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

function createContextPack(): ContextPack {
  return {
    agentRunId: createAgentRunId(),
    createdAt: "2026-01-01T00:00:00.000Z",
    question: "What is shown on the dashboard?",
    dashboardContext: createDashboardContext(),
  };
}

describe("fixed plan builder", () => {
  it("returns the current dashboard summary plan for context-only intents", () => {
    const contextPack = createContextPack();
    const input: BuildFixedPlanInput = {
      agentRunId: contextPack.agentRunId,
      intent: {
        name: "dashboard_explanation",
        confidence: 0.94,
        reasonBrief: "The question asks for a dashboard summary.",
        answerableFromContext: true,
        needsMcp: false,
        maxToolCalls: 0,
        normalizedQuestion: contextPack.question,
      },
      contextPack,
    };

    const selection = buildFixedPlan(input);

    expect(selection.matched).toBe(true);
    expect(selection.plan.id).toBe(CURRENT_DASHBOARD_SUMMARY_PLAN.id);
    expect(selection.plan.requiredContextPacks).toEqual(["dashboard_context"]);
    expect(selection.plan.allowedTools).toEqual([]);
    expect(selection.plan.budget).toMatchObject({
      maxModelCalls: 1,
      maxToolCalls: 0,
      timeoutMs: 15_000,
    });
    expect(selection.plan.toolPolicy).toMatchObject({
      mode: "denylist",
      allowedTools: [],
    });
  });

  it("returns an unsupported fallback plan for unsupported intents", () => {
    const input: BuildFixedPlanInput = {
      agentRunId: createAgentRunId(),
      intent: {
        name: "metadata_lookup",
        confidence: 0.8,
        reasonBrief: "The question asks about metadata.",
        answerableFromContext: false,
        needsMcp: true,
        maxToolCalls: 2,
        normalizedQuestion: "Tell me about the data source",
      },
      contextPack: createContextPack(),
    };

    const selection = buildFixedPlan(input);

    expect(selection.matched).toBe(false);
    expect(selection.unsupportedIntent).toBe("metadata_lookup");
    expect(selection.plan.id).toBe("unsupported-intent-v1");
    expect(selection.plan.responseStrategy).toBe("decline_unsupported_intent");
    expect(selection.plan.allowedTools).toEqual([]);
  });

  it("does not mutate the input context pack or plan objects", () => {
    const contextPack = createContextPack();
    const contextPackSnapshot = structuredClone(contextPack);
    const input: BuildFixedPlanInput = {
      agentRunId: contextPack.agentRunId,
      intent: {
        name: "filter_or_selection_state",
        confidence: 0.91,
        reasonBrief: "The question asks about selection state.",
        answerableFromContext: true,
        needsMcp: false,
        maxToolCalls: 0,
        normalizedQuestion: contextPack.question,
      },
      contextPack,
      metadata: {
        source: "unit-test",
      },
    };

    const selection = buildFixedPlan(input);

    expect(contextPack).toEqual(contextPackSnapshot);
    expect(selection.plan.metadata).toMatchObject({
      planFamily: "fixed",
      source: "unit-test",
    });
  });
});
