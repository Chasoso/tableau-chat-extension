import { describe, expect, it } from "vitest";
import {
  createAgentRunId,
  runSelectedMarkExplanationOrchestration,
  type SelectedMarkOrchestrationInput,
  type IntentResolutionInput,
  type SelectedMarkOrchestrationResponse,
} from "../src/agent";

function createIntentResolutionInput(
  contextSummary: NonNullable<IntentResolutionInput["contextSummary"]>,
): IntentResolutionInput {
  const agentRunId = createAgentRunId();

  return {
    agentRunId,
    frontendActionId: "explain_selection",
    requestedIntentId: "selected_mark_explanation",
    message: "Explain this selection.",
    contextSummary,
    resolverMode: "deterministic",
    traceMetadata: {
      source: "unit-test",
    },
    metadata: {
      source: "unit-test",
    },
  };
}

function createSelectedMarkContextSummary(
  overrides: Partial<NonNullable<IntentResolutionInput["contextSummary"]>> = {},
): NonNullable<IntentResolutionInput["contextSummary"]> {
  return {
    dashboardName: "Executive Overview",
    workbookName: "Sales Workbook",
    viewName: "Executive Overview",
    worksheetNames: ["Sales Trend"],
    selectedMarks: {
      hasSelectedMarks: true,
      totalCount: 3,
      previewCount: 1,
      truncated: false,
      worksheetNames: ["Sales Trend"],
    },
    summaryDataPreview: {
      available: true,
      rowCount: 10,
      columnCount: 3,
      columnNames: ["Region", "Sales", "Profit"],
      truncated: true,
    },
    filters: {
      count: 2,
      names: ["Year", "Region"],
    },
    parameters: {
      count: 1,
      names: ["Metric Selector"],
    },
    ...overrides,
  };
}

function createSelectedMarkOrchestrationInput(
  contextSummary: NonNullable<IntentResolutionInput["contextSummary"]>,
): SelectedMarkOrchestrationInput {
  const intentResolutionInput = createIntentResolutionInput(contextSummary);

  return {
    agentRunId: intentResolutionInput.agentRunId,
    intentResolutionInput,
    contextSummary,
    metadata: {
      source: "unit-test",
    },
  };
}

describe("selected-mark explanation orchestration", () => {
  it("executes context tools and returns JSON-safe response material", async () => {
    const response = (await runSelectedMarkExplanationOrchestration(
      createSelectedMarkOrchestrationInput(createSelectedMarkContextSummary()),
    )) as SelectedMarkOrchestrationResponse;

    expect(response.status).toBe("partial");
    expect(response.planSelection?.selectedPlan.id).toBe(
      "selected_mark_explanation-v1",
    );
    expect(response.execution?.stepResults.map((step) => step.status)).toEqual([
      "not_executed",
      "routed",
      "routed",
      "routed",
      "routed",
      "not_executed",
    ]);
    expect(response.responseMaterial).toEqual(
      expect.objectContaining({
        intentId: "selected_mark_explanation",
        selectedMarks: expect.objectContaining({
          available: true,
          count: 3,
          worksheetNames: ["Sales Trend"],
        }),
        summaryDataPreview: expect.objectContaining({
          available: true,
          rowCount: 10,
          columnCount: 3,
          columnNames: ["Region", "Sales", "Profit"],
          truncated: true,
        }),
        filters: expect.objectContaining({
          available: true,
          count: 2,
          names: ["Year", "Region"],
        }),
        parameters: expect.objectContaining({
          available: true,
          count: 1,
          names: ["Metric Selector"],
        }),
      }),
    );
    expect(JSON.stringify(response.responseMaterial)).toContain(
      "selected_mark_explanation",
    );
    expect(JSON.stringify(response.responseMaterial)).not.toContain('"rows"');
    expect(JSON.stringify(response.responseMaterial)).not.toContain('"values"');
    expect(response.placeholderResponse).toContain("Selected marks: 3");
    expect(response.placeholderResponse).toContain(
      "Summary data preview: available",
    );
    expect(response.placeholderResponse).toContain("Filters: 2");
    expect(response.placeholderResponse).toContain("Parameters: 1");
    expect(
      response.traceEvents.some(
        (event) => event.type === "tool_registry.lookup",
      ),
    ).toBe(true);
    expect(
      response.traceEvents.some(
        (event) => event.type === "tool_precondition.passed",
      ),
    ).toBe(true);
    expect(
      response.traceEvents.some(
        (event) => event.type === "tool_execution.started",
      ),
    ).toBe(true);
    expect(
      response.traceEvents.some(
        (event) => event.type === "tool_execution.completed",
      ),
    ).toBe(true);
    expect(response.traceMetadata?.responseComposer).toMatchObject({
      composerType: "minimal",
      responseType: "deterministic_summary",
      responseStatus: "composed",
      intentId: "selected_mark_explanation",
      planId: "selected_mark_explanation-v1",
    });
    expect(JSON.parse(JSON.stringify(response.responseMaterial))).toEqual(
      response.responseMaterial,
    );
  });

  it("continues when optional context tools are unavailable", async () => {
    const response = (await runSelectedMarkExplanationOrchestration(
      createSelectedMarkOrchestrationInput(
        createSelectedMarkContextSummary({
          summaryDataPreview: undefined,
          filters: undefined,
          parameters: undefined,
        }),
      ),
    )) as SelectedMarkOrchestrationResponse;

    expect(response.status).toBe("partial");
    expect(response.responseMaterial?.summaryDataPreview?.available).toBe(
      false,
    );
    expect(response.placeholderResponse).toContain(
      "Summary data preview: unavailable",
    );
    expect(response.placeholderResponse).toContain("Filters: 0");
    expect(response.placeholderResponse).toContain("Parameters: 0");
  });

  it("falls back safely when selected marks are missing", async () => {
    const response = (await runSelectedMarkExplanationOrchestration(
      createSelectedMarkOrchestrationInput(
        createSelectedMarkContextSummary({
          selectedMarks: {
            hasSelectedMarks: false,
            totalCount: 0,
            previewCount: 0,
            truncated: false,
            worksheetNames: [],
          },
        }),
      ),
    )) as SelectedMarkOrchestrationResponse;

    expect(response.status).toBe("fallback");
    expect(response.execution).toBeUndefined();
    expect(response.responseMaterial).toBeUndefined();
    expect(response.placeholderResponse).toContain(
      "Structured orchestration could not resolve",
    );
    expect(
      response.traceEvents.some((event) => event.type === "fallback.selected"),
    ).toBe(true);
  });
});
