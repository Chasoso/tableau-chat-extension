import { describe, expect, it } from "vitest";
import {
  composeResponse,
  composeSelectedMarkExplanationResponse,
  createMinimalResponseComposer,
  type ResponseComposerInput,
} from "../src/agent";

function createSelectedMarkExplanationMaterial(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const material: Record<string, unknown> = {
    intentId: "selected_mark_explanation",
    selectedMarks: {
      available: true,
      count: 3,
      worksheetNames: ["Sales Map"],
      fieldNames: ["Region", "Sales"],
      items: [
        {
          worksheetName: "Sales Map",
          columns: ["Region", "Sales"],
          rowCount: 3,
          status: "available",
          rows: [
            {
              values: [
                {
                  fieldName: "Region",
                  raw: "West",
                  display: "West",
                  isEmpty: false,
                },
                {
                  fieldName: "Sales",
                  raw: 123,
                  display: "123",
                  isEmpty: false,
                },
              ],
            },
          ],
        },
      ],
      summary:
        "Selected 3 mark(s) across 1 worksheet(s). Row preview: Region=West, Sales=123",
    },
    summaryDataPreview: {
      available: true,
      rowCount: 10,
      columnCount: 3,
      columnNames: ["Region", "Sales", "Profit"],
      truncated: true,
    },
    filters: {
      available: true,
      count: 2,
      names: ["Year", "Region"],
    },
    parameters: {
      available: true,
      count: 1,
      names: ["Metric Selector"],
    },
    warnings: ["material_warning"],
    metadata: {
      accessToken: "secret-value",
      source: "unit-test",
    },
  };

  return Object.assign(material, overrides);
}

function createInput(
  overrides: Partial<ResponseComposerInput> = {},
): ResponseComposerInput {
  return {
    agentRunId: "agent-run-1",
    intentId: "selected_mark_explanation",
    planId: "selected_mark_explanation-v1",
    executionStatus: "partial",
    responseStrategy: "explain_selection",
    responseMaterial: createSelectedMarkExplanationMaterial(),
    warnings: ["input_warning"],
    errors: [{ message: "step failed", code: "step-1" }],
    fallbackReason: "fallback",
    locale: "en",
    metadata: {
      source: "unit-test",
      accessToken: "secret-value",
    },
    traceMetadata: {
      requestId: "request-1",
    },
    ...overrides,
  };
}

describe("ResponseComposer", () => {
  it("composes a deterministic selected_mark_explanation response", async () => {
    const composer = createMinimalResponseComposer();
    const result = await composer.compose(createInput());

    expect(result.status).toBe("composed");
    expect(result.responseType).toBe("deterministic_summary");
    expect(result.intentId).toBe("selected_mark_explanation");
    expect(result.message).toContain("Structured orchestration is connected");
    expect(result.message).toContain("Selected marks: 3");
    expect(result.message).toContain("Sales Map: 3 row(s)");
    expect(result.message).toContain("row 1: Region=West, Sales=123");
    expect(result.message).toContain("Summary data preview: available");
    expect(result.message).toContain("Filters: 2");
    expect(result.message).toContain("Parameters: 1");
    expect(result.summary).toMatchObject({
      intentId: "selected_mark_explanation",
      selectedMarks: {
        available: true,
        count: 3,
        worksheetNames: ["Sales Map"],
        fieldNames: ["Region", "Sales"],
        summary:
          "Selected 3 mark(s) across 1 worksheet(s). Row preview: Region=West, Sales=123",
        items: [
          expect.objectContaining({
            worksheetName: "Sales Map",
            rowCount: 3,
            status: "available",
          }),
        ],
      },
      summaryDataPreview: {
        available: true,
        rowCount: 10,
        columnCount: 3,
        columnNames: ["Region", "Sales", "Profit"],
        truncated: true,
      },
      filters: {
        available: true,
        count: 2,
        names: ["Year", "Region"],
      },
      parameters: {
        available: true,
        count: 1,
        names: ["Metric Selector"],
      },
    });
    expect(result.sourceMaterialSummary).toMatchObject({
      selectedMarks: {
        count: 3,
      },
    });
    expect(result.warnings).toEqual(["input_warning", "material_warning"]);
    expect(result.errors).toEqual([
      {
        message: "step failed",
        code: "step-1",
      },
    ]);
    expect(result.traceMetadata).toMatchObject({
      composerType: "minimal",
      responseType: "deterministic_summary",
      responseStatus: "composed",
      intentId: "selected_mark_explanation",
      planId: "selected_mark_explanation-v1",
      executionStatus: "partial",
      fallbackReason: "fallback",
      warnings: ["input_warning"],
      errors: [
        {
          message: "step failed",
          code: "step-1",
        },
      ],
      sourceMaterialSummary: {
        selectedMarks: {
          count: 3,
        },
      },
    });
    expect(result.traceMetadata?.metadata).toMatchObject({
      source: "unit-test",
      accessToken: "[REDACTED]",
    });
    expect(result.traceMetadata?.traceMetadata).toMatchObject({
      requestId: "request-1",
    });
    expect(result.jsonSafe).toBe(true);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(JSON.stringify(result)).not.toContain("secret-value");
    expect(JSON.stringify(result)).toContain('"rows"');
    expect(JSON.stringify(result)).toContain('"values"');
  });

  it("falls back safely when selected marks are unavailable", async () => {
    const composer = createMinimalResponseComposer();
    const result = await composer.compose(
      createInput({
        responseMaterial: createSelectedMarkExplanationMaterial({
          selectedMarks: {
            available: false,
            count: 0,
            worksheetNames: [],
            fieldNames: [],
            summary: "No selected marks are available.",
          },
        }),
      }),
    );

    expect(result.status).toBe("fallback");
    expect(result.responseType).toBe("fallback_message");
    expect(result.message).toContain("Select one or more marks");
    expect(result.summary).toMatchObject({
      intentId: "selected_mark_explanation",
      selectedMarks: {
        available: false,
        count: 0,
      },
    });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("supports unsupported intents with a safe fallback response", async () => {
    const result = await composeResponse({
      intentId: "unsupported_intent",
      responseMaterial: {
        some: "value",
      },
    });

    expect(result.status).toBe("fallback");
    expect(result.responseType).toBe("fallback_message");
    expect(result.message).toContain("not supported");
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("builds the placeholder response from the composed message", () => {
    const response = composeSelectedMarkExplanationResponse({
      intentId: "selected_mark_explanation",
      responseMaterial: createSelectedMarkExplanationMaterial(),
    });

    expect(response.message).toContain("Selected marks: 3");
    expect(response.status).toBe("composed");
  });
});
