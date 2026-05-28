import { describe, expect, it } from "vitest";
import {
  buildMcpErrorMessage,
  checkToolPreconditions,
  classifyMcpErrorCategory,
  extractBestWorkbookId,
  extractDatasourcesFromRawToolResults,
  extractWorkbookFromToolResults,
  isMcpErrorResult,
} from "../src/tableau/tableauMcpContextProvider";
import type { TableauMcpToolResultSummary } from "../src/types/tableau";
import type { GetAdditionalContextInput } from "../src/tableau/contextProvider";

const baseInput: GetAdditionalContextInput = {
  question: "Resolve dashboard context",
  dashboardContext: {
    dashboardName: "Statistics",
    worksheets: [{ name: "Views" }, { name: "Favorites" }],
    filters: [],
    parameters: [],
    capturedAt: "2026-05-27T00:00:00.000Z",
  },
  tableauSubject: "user@example.com",
};

describe("TableauMcpContextProvider extraction helpers", () => {
  it("extracts workbook name from search-content parentWorkbookName", () => {
    const toolResults: TableauMcpToolResultSummary[] = [
      {
        toolName: "search-content",
        status: "success",
        summary: JSON.stringify([
          {
            type: "view",
            sheetType: "dashboard",
            title: "Statistics",
            parentWorkbookName: "Tableau Public Insights",
            luid: "8199f5d0-dff2-4d2d-a8ea-4bbef7c5a896",
          },
        ]),
      },
    ];

    expect(extractWorkbookFromToolResults(toolResults, baseInput)).toEqual({
      name: "Tableau Public Insights",
    });
  });

  it("prefers nested workbook id from list-views over the view id", () => {
    const result = {
      content: [
        {
          text: JSON.stringify([
            {
              id: "8199f5d0-dff2-4d2d-a8ea-4bbef7c5a896",
              name: "Statistics",
              workbook: {
                id: "d351b42d-7545-4cbd-bd76-e23410275f1b",
              },
            },
          ]),
        },
      ],
    };

    expect(extractBestWorkbookId(result, "Statistics")).toBe("d351b42d-7545-4cbd-bd76-e23410275f1b");
  });

  it("extracts structured datasource records from untruncated list-datasources results", () => {
    const input: GetAdditionalContextInput = {
      ...baseInput,
      dashboardContext: {
        ...baseInput.dashboardContext,
        dataSources: [{ name: "Tableau Public Per Day(2025/04-)" }],
      },
    };
    const result = {
      content: [
        {
          text: JSON.stringify([
            {
              id: "not-used",
              name: "Other Datasource",
              project: { id: "project-1", name: "Sandbox" },
              tags: {},
            },
            {
              id: "datasource-luid",
              name: "Tableau Public Per Day(2025/04-)",
              description: "Daily Tableau Public activity data.",
              project: { id: "project-1", name: "Sandbox" },
              tags: {},
            },
          ]),
        },
      ],
    };

    expect(extractDatasourcesFromRawToolResults([{ toolName: "list-datasources", result }], input)).toEqual([
      {
        id: "datasource-luid",
        name: "Tableau Public Per Day(2025/04-)",
        contentUrl: undefined,
        description: "Daily Tableau Public activity data.",
        webpageUrl: undefined,
        project: {
          id: "project-1",
          name: "Sandbox",
        },
      },
    ]);
  });

  it("precondition blocks datasource metadata call when datasource id is missing but name exists", () => {
    const result = checkToolPreconditions(
      "get-datasource-metadata",
      {},
      {
        intent: {
          intent: "metadata_lookup",
          confidence: 0.8,
          reasonBrief: "Need datasource metadata.",
          answerableFromDashboardContext: false,
          needsMcp: true,
          maxToolCalls: 5,
        },
        dashboardContext: {
          ...baseInput.dashboardContext,
          dataSources: [{ name: "Tableau Public Per Day(2025/04-)" }],
        },
        calledToolNames: new Set<string>(),
        executedToolResults: [],
      },
    );

    expect(result.ok).toBe(false);
    expect(result.recoverable).toBe(true);
    expect(result.suggestedTools).toContain("list-datasources");
  });

  it("precondition allows datasource metadata call when datasource id is provided", () => {
    const result = checkToolPreconditions(
      "get-datasource-metadata",
      {
        datasourceLuid: "datasource-luid",
      },
      {
        intent: {
          intent: "metadata_lookup",
          confidence: 0.9,
          reasonBrief: "Need datasource metadata.",
          answerableFromDashboardContext: false,
          needsMcp: true,
          maxToolCalls: 5,
        },
        dashboardContext: {
          ...baseInput.dashboardContext,
          dataSources: [{ name: "Tableau Public Per Day(2025/04-)", id: "datasource-luid" }],
        },
        calledToolNames: new Set<string>(),
        executedToolResults: [],
      },
    );

    expect(result.ok).toBe(true);
  });

  it("treats MCP isError responses as failures and classifies invalid requests", () => {
    const errorResult = {
      content: [{ type: "text", text: "Request failed with status code 400" }],
      isError: true,
    };

    expect(isMcpErrorResult(errorResult)).toBe(true);
    const category = classifyMcpErrorCategory(errorResult);
    expect(category).toBe("request_invalid_or_identifier_missing");
    expect(buildMcpErrorMessage(errorResult, category)).toContain("invalid");
  });

  it("precondition becomes non-recoverable after context resolution attempts still lack datasource identifier", () => {
    const result = checkToolPreconditions(
      "get-datasource-metadata",
      {},
      {
        intent: {
          intent: "metadata_lookup",
          confidence: 0.8,
          reasonBrief: "Need datasource metadata.",
          answerableFromDashboardContext: false,
          needsMcp: true,
          maxToolCalls: 5,
        },
        dashboardContext: {
          ...baseInput.dashboardContext,
        },
        calledToolNames: new Set<string>(["list-views", "list-workbooks", "search-content"]),
        executedToolResults: [
          {
            toolName: "list-views",
            status: "success",
          },
          {
            toolName: "list-workbooks",
            status: "success",
          },
        ],
      },
    );

    expect(result.ok).toBe(false);
    expect(result.recoverable).toBe(false);
  });
});
