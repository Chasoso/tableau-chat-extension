import { describe, expect, it } from "vitest";
import { safeJsonSnippet } from "../src/services/contextCompressor";
import type { ChatRequest } from "../src/types/chat";
import type { TableauAdditionalContext } from "../src/types/tableau";
import {
  compressDashboardContext,
  renderCompressedContext,
} from "../src/services/contextCompressor";

describe("contextCompressor", () => {
  it("redacts token and authorization style keys from json snippets", () => {
    const snippet = safeJsonSnippet(
      {
        token: "secret-token",
        cookie: "session-cookie",
        authorization: "Bearer abc",
        secretValue: "top-secret",
        nested: {
          password: "hidden",
          visible: "keep-me",
        },
      },
      500,
    );

    expect(snippet).toContain("[REDACTED]");
    expect(snippet).toContain("keep-me");
    expect(snippet).not.toContain("secret-token");
    expect(snippet).not.toContain("session-cookie");
    expect(snippet).not.toContain("Bearer abc");
    expect(snippet).not.toContain("top-secret");
    expect(snippet).not.toContain("hidden");
  });

  it("renders selected mark row values in compressed context", () => {
    const request = {
      question: "Explain this selection.",
      dashboardContext: {
        dashboardName: "Executive Overview",
        workbookName: "Sales Workbook",
        workbookId: "workbook-1",
        viewName: "Executive Overview",
        viewId: "view-1",
        worksheets: [],
        filters: [],
        parameters: [],
        selectedMarks: [
          {
            worksheetName: "Sales Trend",
            columns: ["Region", "Sales"],
            rowCount: 1,
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
        dataSources: [],
        capturedAt: "2026-06-07T00:00:00.000Z",
      },
    } satisfies ChatRequest;
    const additionalContext = {
      provider: "mock",
      mcpExecutionDebug: {
        intent: "dashboard_explanation",
        intentConfidence: 1,
        answerableFromDashboardContext: true,
        needsMcp: false,
        maxToolCalls: 0,
        plannedTools: [],
        blockedTools: [],
        executedTools: [],
        skippedTools: [],
        toolCallCount: 0,
        replanUsed: false,
        timingMs: {
          planning: 0,
          execution: 0,
        },
      },
    } satisfies TableauAdditionalContext;

    const compressed = compressDashboardContext(request, additionalContext);
    const rendered = renderCompressedContext(compressed);

    expect(rendered).toContain("Sales Trend");
    expect(rendered).toContain("Region=West");
    expect(rendered).toContain("Sales=123");
  });
});
