import { describe, expect, it } from "vitest";
import {
  createAgentRunId,
  createMinimalIntentResolver,
  type IntentId,
  type IntentResolutionResult,
  type IntentResolver,
} from "../src/agent";

function createResolver(): IntentResolver {
  return createMinimalIntentResolver();
}

function createContextSummary(selectedMarkCount = 3) {
  return {
    dashboardName: "Sales Dashboard",
    workbookName: "Sales Workbook",
    viewName: "Sales by Region",
    worksheetNames: ["Map", "Table"],
    selectedMarks: {
      hasSelectedMarks: selectedMarkCount > 0,
      totalCount: selectedMarkCount,
      previewCount: Math.min(selectedMarkCount, 3),
      truncated: selectedMarkCount > 3,
      worksheetNames: ["Map"],
    },
  };
}

function expectCommonShape(
  result: IntentResolutionResult,
  expected: Partial<IntentResolutionResult>,
) {
  expect(result).toMatchObject(expected);
  expect(result.confidence).toBeGreaterThanOrEqual(0);
  expect(result.confidence).toBeLessThanOrEqual(1);
  expect(Array.isArray(result.evidence)).toBe(true);
  expect(Array.isArray(result.warnings)).toBe(true);
}

describe("MinimalIntentResolver", () => {
  it("resolves an explicit selected_mark_explanation intent", async () => {
    const resolver = createResolver();
    const result = await resolver.resolve({
      agentRunId: createAgentRunId(),
      requestedIntentId: "selected_mark_explanation",
      contextSummary: createContextSummary(2),
      availableIntentIds: [
        "selected_mark_explanation",
        "current_dashboard_summary",
      ],
      resolverMode: "deterministic",
    });

    expectCommonShape(result, {
      status: "resolved",
      resolvedIntentId: "selected_mark_explanation",
      source: "explicit",
      reason: "Explicit intent 'selected_mark_explanation' was provided.",
    });
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "requestedIntentId",
          value: "selected_mark_explanation",
        }),
      ]),
    );
  });

  it("returns unresolved when explicit selected_mark_explanation has no selected marks", async () => {
    const resolver = createResolver();
    const result = await resolver.resolve({
      agentRunId: createAgentRunId(),
      requestedIntentId: "selected_mark_explanation",
      contextSummary: createContextSummary(0),
      availableIntentIds: [
        "selected_mark_explanation",
        "current_dashboard_summary",
      ],
    });

    expectCommonShape(result, {
      status: "unresolved",
      resolvedIntentId: "unknown",
      source: "explicit",
    });
    expect(result.reason).toContain("requires at least one selected mark");
    expect(result.warnings).toContain("missing_selected_marks");
  });

  it("returns unresolved for an unsupported explicit intent", async () => {
    const resolver = createResolver();
    const result = await resolver.resolve({
      agentRunId: createAgentRunId(),
      requestedIntentId: "metadata_lookup" as IntentId,
      contextSummary: createContextSummary(2),
      availableIntentIds: [
        "selected_mark_explanation",
        "current_dashboard_summary",
      ],
    });

    expectCommonShape(result, {
      status: "unresolved",
      resolvedIntentId: "unknown",
      source: "explicit",
    });
    expect(result.reason).toContain("not supported");
    expect(result.warnings).toContain("unsupported_requested_intent");
  });

  it("resolves explain_selection to selected_mark_explanation", async () => {
    const resolver = createResolver();
    const result = await resolver.resolve({
      agentRunId: createAgentRunId(),
      frontendActionId: "explain_selection",
      contextSummary: createContextSummary(1),
      availableIntentIds: [
        "selected_mark_explanation",
        "current_dashboard_summary",
      ],
    });

    expectCommonShape(result, {
      status: "resolved",
      resolvedIntentId: "selected_mark_explanation",
      source: "ui_action",
    });
    expect(result.reason).toContain("UI action 'explain_selection'");
  });

  it("returns fallback for an unknown action id", async () => {
    const resolver = createResolver();
    const result = await resolver.resolve({
      agentRunId: createAgentRunId(),
      frontendActionId: "unknown_action",
      contextSummary: createContextSummary(2),
      availableIntentIds: [
        "selected_mark_explanation",
        "current_dashboard_summary",
      ],
    });

    expectCommonShape(result, {
      status: "fallback",
      resolvedIntentId: "unknown",
      source: "fallback",
    });
    expect(result.reason).toContain("No matching intent");
  });

  it("falls back when explain_selection is triggered without selected marks", async () => {
    const resolver = createResolver();
    const result = await resolver.resolve({
      agentRunId: createAgentRunId(),
      frontendActionId: "explain_selection",
      contextSummary: createContextSummary(0),
      availableIntentIds: [
        "selected_mark_explanation",
        "current_dashboard_summary",
      ],
    });

    expectCommonShape(result, {
      status: "fallback",
      resolvedIntentId: "selected_mark_explanation",
      fallbackIntentId: "selected_mark_explanation",
      source: "ui_action",
    });
    expect(result.reason).toContain("no selected marks");
    expect(result.warnings).toContain("missing_selected_marks");
  });

  it("uses deterministic rules for selected-mark explanation messages", async () => {
    const resolver = createResolver();
    const result = await resolver.resolve({
      agentRunId: createAgentRunId(),
      message: "Please explain this selection.",
      contextSummary: createContextSummary(4),
      availableIntentIds: [
        "selected_mark_explanation",
        "current_dashboard_summary",
      ],
    });

    expectCommonShape(result, {
      status: "resolved",
      resolvedIntentId: "selected_mark_explanation",
      source: "deterministic_rule",
    });
    expect(result.reason).toContain("selected-mark explanation");
  });

  it("does not resolve ambiguous free-form input", async () => {
    const resolver = createResolver();
    const result = await resolver.resolve({
      agentRunId: createAgentRunId(),
      message: "hello there",
      contextSummary: createContextSummary(0),
      availableIntentIds: [
        "selected_mark_explanation",
        "current_dashboard_summary",
      ],
    });

    expectCommonShape(result, {
      status: "fallback",
      resolvedIntentId: "unknown",
      source: "fallback",
    });
    expect(result.reason).toContain("No matching intent");
    expect(result.warnings).toEqual(
      expect.arrayContaining(["no_matching_intent", "missing_selected_marks"]),
    );
  });

  it("keeps source, reason, evidence, and warnings on the result", async () => {
    const resolver = createResolver();
    const result = await resolver.resolve({
      agentRunId: createAgentRunId(),
      requestedIntentId: "selected_mark_explanation",
      contextSummary: createContextSummary(2),
      availableIntentIds: [
        "selected_mark_explanation",
        "current_dashboard_summary",
      ],
    });

    expect(result.source).toBe("explicit");
    expect(result.reason).toBeTruthy();
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.warnings).toEqual([]);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("does not need Bedrock, Tableau MCP, ChatService, or runLightweightAgentLoop", async () => {
    const resolver = createResolver();
    const result = await resolver.resolve({
      agentRunId: createAgentRunId(),
      requestedIntentId: "selected_mark_explanation",
      contextSummary: createContextSummary(2),
      availableIntentIds: [
        "selected_mark_explanation",
        "current_dashboard_summary",
      ],
    });

    expect(result.status).toBe("resolved");
  });
});
