import { describe, expect, it } from "vitest";
import {
  buildFixedPlan,
  buildPlanExecutionMetadata,
  buildPlanSelection,
  CURRENT_DASHBOARD_SUMMARY_PLAN,
  createAgentRunId,
  createCurrentDashboardSummaryPlanDefinition,
  createResolvedIntentResolution,
  createSelectedMarkExplanationPlanDefinition,
  createUnsupportedPlanDefinition,
  evaluatePlanPreconditions,
  isValidRunBudget,
  normalizeRunBudget,
  type ContextPack,
  type PlanDefinition,
} from "../src/agent";
import type { DashboardContext } from "../src/types/tableau";

function createDashboardContext(selectedMarkCount = 2): DashboardContext {
  return {
    dashboardName: "Sales Overview",
    workbookName: "Sales Workbook",
    viewName: "Sales by Region",
    worksheets: [{ name: "Sales by Region" }],
    filters: [],
    parameters: [],
    selectedMarks:
      selectedMarkCount > 0
        ? Array.from({ length: selectedMarkCount }, (_, index) => ({
            worksheetName: "Sales by Region",
            columns: ["Region", "Sales"],
            rowCount: index + 1,
          }))
        : [],
    capturedAt: "2026-01-01T00:00:00.000Z",
  };
}

function createContextPack(selectedMarkCount = 2): ContextPack {
  return {
    agentRunId: createAgentRunId(),
    createdAt: "2026-01-01T00:00:00.000Z",
    question: "Explain this selection.",
    dashboardContext: createDashboardContext(selectedMarkCount),
  };
}

function expectPlanDefinition(plan: PlanDefinition) {
  expect(plan.id).toMatch(/-v1$/);
  expect(plan.intentId).toBeTruthy();
  expect(plan.title).toBeTruthy();
  expect(Array.isArray(plan.requiredContextPacks)).toBe(true);
  expect(Array.isArray(plan.preconditions)).toBe(true);
  expect(Array.isArray(plan.allowedTools)).toBe(true);
  expect(Array.isArray(plan.disallowedTools)).toBe(true);
  expect(Array.isArray(plan.steps)).toBe(true);
  expect(plan.budget).toMatchObject({
    maxModelCalls: expect.any(Number),
    maxToolCalls: expect.any(Number),
    timeoutMs: expect.any(Number),
  });
}

describe("plan execution contract", () => {
  it("creates a selected_mark_explanation plan definition", () => {
    const plan = createSelectedMarkExplanationPlanDefinition();
    const contextPack = createContextPack(2);
    const preconditions = evaluatePlanPreconditions(plan, contextPack);

    expectPlanDefinition(plan);
    expect(plan.intentId).toBe("selected_mark_explanation");
    expect(plan.responseStrategy).toBe("explain_selection");
    expect(plan.requiredContextPacks).toEqual([
      "dashboard_context",
      "context_preview",
      "selected_marks",
    ]);
    expect(plan.steps.map((step) => step.type)).toEqual([
      "validate_context",
      "call_tool",
      "call_tool",
      "compose_response",
    ]);
    expect(plan.allowedTools).toEqual(["context"]);
    expect(plan.budget).toMatchObject({
      maxModelCalls: 0,
      maxToolCalls: 2,
      timeoutMs: 15_000,
    });
    expect(preconditions.every((item) => item.satisfied)).toBe(true);
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
  });

  it("normalizes budgets and rejects invalid budget shapes", () => {
    const budget = normalizeRunBudget({
      maxModelCalls: -2,
      maxToolCalls: 3.8,
      timeoutMs: 0,
      maxRetries: 2.2,
    });

    expect(budget).toEqual({
      maxModelCalls: 1,
      maxToolCalls: 3,
      timeoutMs: 15_000,
      maxRetries: 2,
    });
    expect(isValidRunBudget(budget)).toBe(true);
    expect(
      isValidRunBudget({ maxModelCalls: -1, maxToolCalls: 0, timeoutMs: 0 }),
    ).toBe(false);
  });

  it("selects the selected_mark_explanation plan for a resolved intent", () => {
    const contextPack = createContextPack(2);
    const selection = buildPlanSelection({
      agentRunId: contextPack.agentRunId,
      intentResolution: createResolvedIntentResolution({
        agentRunId: contextPack.agentRunId,
        resolvedIntentId: "selected_mark_explanation",
        confidence: 0.99,
        source: "ui_action",
        reason: "Explain this selection.",
      }),
      contextPack,
    });

    expect(selection.status).toBe("selected");
    expect(selection.matched).toBe(true);
    expect(selection.selectedPlan.id).toBe("selected_mark_explanation-v1");
    expect(selection.selectedPlan.responseStrategy).toBe("explain_selection");
    expect(selection.reasonBrief).toContain("selected-mark explanation");
    expect(selection.preconditions.every((item) => item.satisfied)).toBe(true);
    expect(JSON.parse(JSON.stringify(selection))).toEqual(selection);
  });

  it("falls back when selected marks are missing", () => {
    const contextPack = createContextPack(0);
    const selection = buildPlanSelection({
      agentRunId: contextPack.agentRunId,
      intentResolution: createResolvedIntentResolution({
        agentRunId: contextPack.agentRunId,
        resolvedIntentId: "selected_mark_explanation",
        confidence: 0.99,
        source: "explicit",
        reason: "Explain this selection.",
      }),
      contextPack,
    });

    expect(selection.status).toBe("fallback");
    expect(selection.matched).toBe(true);
    expect(selection.selectedPlan.id).toBe("selected_mark_explanation-v1");
    expect(selection.fallbackPlan?.id).toBe("unsupported-intent-v1");
    expect(selection.reasonBrief).toContain("No selected marks");
    expect(selection.preconditions.some((item) => item.satisfied)).toBe(true);
    expect(selection.preconditions.some((item) => !item.satisfied)).toBe(true);
  });

  it("returns the unsupported plan for unknown intents", () => {
    const contextPack = createContextPack(1);
    const selection = buildPlanSelection({
      agentRunId: contextPack.agentRunId,
      intentResolution: createResolvedIntentResolution({
        agentRunId: contextPack.agentRunId,
        resolvedIntentId: "unknown",
        confidence: 0.1,
        source: "fallback",
        reason: "No matching intent.",
      }),
      contextPack,
    });

    expect(selection.status).toBe("unsupported");
    expect(selection.matched).toBe(false);
    expect(selection.selectedPlan.id).toBe("unsupported-intent-v1");
    expect(selection.unsupportedIntentId).toBe("unknown");
  });

  it("builds JSON-safe plan execution metadata", () => {
    const contextPack = createContextPack(2);
    const selection = buildPlanSelection({
      agentRunId: contextPack.agentRunId,
      intentResolution: createResolvedIntentResolution({
        agentRunId: contextPack.agentRunId,
        resolvedIntentId: "selected_mark_explanation",
        confidence: 0.99,
        source: "ui_action",
        reason: "Explain this selection.",
      }),
      contextPack,
    });

    const metadata = buildPlanExecutionMetadata({
      selection,
      runBudget: selection.selectedPlan.budget,
    });

    expect(JSON.parse(JSON.stringify(metadata))).toEqual(metadata);
    expect(metadata.planId).toBe("selected_mark_explanation-v1");
    expect(metadata.responseStrategy).toBe("explain_selection");
  });

  it("keeps the existing fixed plan exports intact", () => {
    const contextPack = createContextPack(2);

    expect(CURRENT_DASHBOARD_SUMMARY_PLAN.id).toBe(
      "current-dashboard-summary-v1",
    );
    expect(
      buildFixedPlan({
        agentRunId: contextPack.agentRunId,
        intent: {
          name: "dashboard_explanation",
          confidence: 0.9,
          reasonBrief: "Context-only request.",
          answerableFromContext: true,
          needsMcp: false,
          maxToolCalls: 0,
          normalizedQuestion: contextPack.question,
        },
        contextPack,
      }).plan.id,
    ).toBe("current-dashboard-summary-v1");

    expect(createCurrentDashboardSummaryPlanDefinition()).toMatchObject({
      id: "current-dashboard-summary-v1",
      responseStrategy: "summarize_context",
    });
    expect(createUnsupportedPlanDefinition()).toMatchObject({
      id: "unsupported-intent-v1",
      responseStrategy: "fallback_message",
    });
  });
});
