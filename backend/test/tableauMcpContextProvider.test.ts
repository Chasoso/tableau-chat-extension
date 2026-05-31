import { describe, expect, it } from "vitest";
import {
  buildMetadataIdentifierRecoverySelection,
  buildRuleBasedInitialSelections,
  buildMcpErrorMessage,
  checkToolPreconditions,
  classifyMcpErrorCategory,
  extractBestWorkbookId,
  extractDatasourcesFromRawToolResults,
  extractWorkbookFromToolResults,
  inferPlannedToolArguments,
  isMcpErrorResult,
  normalizeTableauContext,
  resolveDatasourceIdentifier,
} from "../src/tableau/tableauMcpContextProvider";
import type { ClassifiedQuestionIntent } from "../src/services/tableauMcpToolPlanner";
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
        type: "datasource",
        name: "Tableau Public Per Day(2025/04-)",
        id: "datasource-luid",
        luid: "datasource-luid",
        contentUrl: undefined,
        projectName: "Sandbox",
        workbookName: undefined,
      },
    ]);
  });

  it("does not treat project content as datasource", () => {
    const result = {
      content: [
        {
          text: JSON.stringify([
            {
              contentType: "datasource",
              name: "Tableau Public Per Day(2025/04-)",
              id: "datasource-luid",
              projectName: "Sandbox",
            },
            {
              contentType: "project",
              name: "Sandbox",
              id: "project-id",
            },
          ]),
        },
      ],
    };

    expect(extractDatasourcesFromRawToolResults([{ toolName: "search-content", result }], baseInput)).toEqual([
      {
        type: "datasource",
        name: "Tableau Public Per Day(2025/04-)",
        id: "datasource-luid",
        luid: "datasource-luid",
        contentUrl: undefined,
        projectName: "Sandbox",
        workbookName: undefined,
      },
    ]);
  });

  it("does not treat view/workbook/project names as datasource", () => {
    const result = {
      content: [
        {
          text: JSON.stringify([
            {
              id: "view-1",
              name: "Statistics",
              workbook: { name: "Tableau Public Insights" },
              project: { name: "Sandbox" },
            },
          ]),
        },
      ],
    };

    expect(extractDatasourcesFromRawToolResults([{ toolName: "list-views", result }], baseInput)).toEqual([]);
  });

  it("keeps known datasource hint when only view records are present", () => {
    const rawToolResults = [
      {
        toolName: "list-views",
        result: {
          content: [
            {
              text: JSON.stringify([
                {
                  id: "view-1",
                  name: "Statistics",
                  workbook: { name: "Tableau Public Insights" },
                  project: { name: "Sandbox" },
                },
              ]),
            },
          ],
        },
      },
    ];

    const resolved = resolveDatasourceIdentifier(["Tableau Public Per Day(2025/04-)"], [], [], {
      rawToolResults,
      dashboardName: "Statistics",
      viewName: "Statistics",
      workbookName: "Tableau Public Insights",
      worksheetNames: ["Views"],
      projectNames: ["Sandbox"],
    });
    expect(resolved).toEqual([
      {
        name: "Tableau Public Per Day(2025/04-)",
        matchConfidence: 1,
        matchReason: "exact_name_match",
        source: "dashboardContext",
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
        rawToolResults: [],
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
        rawToolResults: [],
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
        rawToolResults: [],
      },
    );

    expect(result.ok).toBe(false);
    expect(result.recoverable).toBe(false);
  });

  it("resolves datasource identifier from list-datasources by name", () => {
    const rawToolResults = [
      {
        toolName: "list-datasources",
        result: {
          content: [
            {
              text: JSON.stringify([
                {
                  name: "Tableau Public Per Day(2025/04-)",
                  id: "ds-123",
                  project: { name: "Sandbox" },
                },
              ]),
            },
          ],
        },
      },
    ];
    const resolved = resolveDatasourceIdentifier(["Tableau Public Per Day(2025/04-)"], [], [], { rawToolResults });
    expect(resolved[0]?.id).toBe("ds-123");
    expect(resolved[0]?.matchReason).toBe("exact_name_match");
  });

  it("does not allow metadata args when only datasource name is provided", () => {
    const tool = {
      name: "get-datasource-metadata",
      inputSchema: {
        type: "object",
        required: ["datasourceLuid"],
        properties: {
          datasourceLuid: { type: "string" },
          datasourceId: { type: "string" },
          name: { type: "string" },
        },
      },
    };

    const args = inferPlannedToolArguments(
      tool,
      { name: "Tableau Public Per Day(2025/04-)" },
      {
        ...baseInput,
        dashboardContext: {
          ...baseInput.dashboardContext,
          dataSources: [{ name: "Tableau Public Per Day(2025/04-)" }],
        },
      },
    );
    expect(args).toBeUndefined();
  });

  it("does not treat workbook name as workbook id for get-workbook", () => {
    const tool = {
      name: "get-workbook",
      inputSchema: {
        type: "object",
        required: ["workbookId"],
        properties: {
          workbookId: { type: "string" },
        },
      },
    };

    const args = inferPlannedToolArguments(
      tool,
      { workbookId: "Tableau Public Insights" },
      {
        ...baseInput,
        dashboardContext: {
          ...baseInput.dashboardContext,
          workbookName: "Tableau Public Insights",
        },
      },
    );
    expect(args).toBeUndefined();
  });

  it("treats multiple close datasource matches as ambiguous", () => {
    const rawToolResults = [
      {
        toolName: "list-datasources",
        result: {
          content: [
            {
              text: JSON.stringify([
                { name: "Sales Daily", id: "ds-1" },
                { name: "Sales_Daily", id: "ds-2" },
              ]),
            },
          ],
        },
      },
    ];

    const resolved = resolveDatasourceIdentifier(["Sales Daily"], [], [], { rawToolResults });
    expect(resolved.length).toBeGreaterThan(1);
    expect(Math.abs(resolved[0]!.matchConfidence - resolved[1]!.matchConfidence)).toBeLessThanOrEqual(0.051);
  });

  it("prioritizes datasource resolution tools for metadata lookup when datasource name exists", () => {
    const intent: ClassifiedQuestionIntent = {
      intent: "metadata_lookup",
      confidence: 0.9,
      reasonBrief: "Need datasource fields.",
      answerableFromDashboardContext: false,
      needsMcp: true,
      maxToolCalls: 5,
    };
    const input: GetAdditionalContextInput = {
      ...baseInput,
      dashboardContext: {
        ...baseInput.dashboardContext,
        dataSources: [{ name: "Tableau Public Per Day(2025/04-)" }],
      },
    };
    const tools = [
      { name: "list-datasources", inputSchema: { type: "object", properties: { limit: { type: "number" } } } },
      { name: "search-content", inputSchema: { type: "object", properties: { terms: { type: "string" } } } },
      { name: "list-views", inputSchema: { type: "object", properties: { limit: { type: "number" } } } },
      { name: "list-workbooks", inputSchema: { type: "object", properties: { limit: { type: "number" } } } },
    ];
    const selection = buildRuleBasedInitialSelections(tools, [], input, intent, 5);
    expect(selection.plannedTools[0]).toBe("list-datasources");
  });

  it("selects list-datasources as recovery tool when datasource is matched but identifier is missing", () => {
    const intent: ClassifiedQuestionIntent = {
      intent: "metadata_lookup",
      confidence: 0.9,
      reasonBrief: "Need datasource fields.",
      answerableFromDashboardContext: false,
      needsMcp: true,
      maxToolCalls: 5,
    };
    const tools = [
      { name: "list-datasources", inputSchema: { type: "object", properties: { limit: { type: "number" } } } },
      { name: "search-content", inputSchema: { type: "object", properties: { terms: { type: "string" } } } },
      { name: "list-views", inputSchema: { type: "object", properties: { limit: { type: "number" } } } },
      { name: "list-workbooks", inputSchema: { type: "object", properties: { limit: { type: "number" } } } },
      { name: "get-workbook", inputSchema: { type: "object", properties: { workbookId: { type: "string" } } } },
      { name: "get-datasource-metadata", inputSchema: { type: "object", properties: { datasourceLuid: { type: "string" } } } },
    ];
    const selection = buildMetadataIdentifierRecoverySelection({
      tools,
      allowedToolNames: tools.map((tool) => tool.name),
      input: {
        ...baseInput,
        dashboardContext: {
          ...baseInput.dashboardContext,
          dataSources: [{ name: "Tableau Public Per Day(2025/04-)" }],
        },
      },
      intent,
      calledToolNames: new Set(["list-views", "get-workbook", "list-workbooks"]),
      rawToolResults: [],
      observations: [],
      remainingToolBudget: 2,
    });
    expect(selection?.status).toBe("ready");
    if (selection?.status === "ready") {
      expect(selection.tool.name).toBe("list-datasources");
    }
  });

  it("selects search-content as recovery tool after list-datasources is called and identifier remains missing", () => {
    const intent: ClassifiedQuestionIntent = {
      intent: "metadata_lookup",
      confidence: 0.9,
      reasonBrief: "Need datasource fields.",
      answerableFromDashboardContext: false,
      needsMcp: true,
      maxToolCalls: 5,
    };
    const tools = [
      { name: "list-datasources", inputSchema: { type: "object", properties: { limit: { type: "number" } } } },
      { name: "search-content", inputSchema: { type: "object", properties: { terms: { type: "string" } } } },
      { name: "get-datasource-metadata", inputSchema: { type: "object", properties: { datasourceLuid: { type: "string" } } } },
    ];
    const selection = buildMetadataIdentifierRecoverySelection({
      tools,
      allowedToolNames: tools.map((tool) => tool.name),
      input: {
        ...baseInput,
        dashboardContext: {
          ...baseInput.dashboardContext,
          dataSources: [{ name: "Tableau Public Per Day(2025/04-)" }],
        },
      },
      intent,
      calledToolNames: new Set(["list-datasources"]),
      rawToolResults: [
        {
          toolName: "list-datasources",
          result: {
            content: [{ text: JSON.stringify([{ name: "Tableau Public Per Day(2025/04-)" }]) }],
          },
        },
      ],
      observations: [],
      remainingToolBudget: 1,
    });
    expect(selection?.status).toBe("ready");
    if (selection?.status === "ready") {
      expect(selection.tool.name).toBe("search-content");
    }
  });

  it("does not enqueue recovery tool when no remaining tool budget", () => {
    const intent: ClassifiedQuestionIntent = {
      intent: "metadata_lookup",
      confidence: 0.9,
      reasonBrief: "Need datasource fields.",
      answerableFromDashboardContext: false,
      needsMcp: true,
      maxToolCalls: 5,
    };
    const tools = [{ name: "list-datasources", inputSchema: { type: "object", properties: { limit: { type: "number" } } } }];
    const selection = buildMetadataIdentifierRecoverySelection({
      tools,
      allowedToolNames: ["list-datasources"],
      input: {
        ...baseInput,
        dashboardContext: {
          ...baseInput.dashboardContext,
          dataSources: [{ name: "Tableau Public Per Day(2025/04-)" }],
        },
      },
      intent,
      calledToolNames: new Set(),
      rawToolResults: [],
      observations: [],
      remainingToolBudget: 0,
    });
    expect(selection).toBeUndefined();
  });

  it("keeps narrowed datasource matches and avoids re-expanding to list-datasources full set", () => {
    const normalized = normalizeTableauContext({
      dashboardContext: {
        ...baseInput.dashboardContext,
        workbookName: "Tableau Public Insights",
      },
      workbook: { name: "Tableau Public Insights", id: "wb-1" },
      datasources: [
        {
          type: "datasource",
          name: "Tableau Public Per Day(2025/04-)",
          id: "ds-target",
          luid: "ds-target",
          projectName: "Sandbox",
        },
      ],
      rawToolResults: [
        {
          toolName: "list-datasources",
          result: {
            content: [
              {
                text: JSON.stringify([
                  { name: "Tableau Public Per Day(2025/04-)", id: "ds-target", project: { name: "Sandbox" } },
                  { name: "Superstore Datasource", id: "ds-other-1", project: { name: "Sandbox" } },
                  { name: "Admin Insights", id: "ds-other-2", project: { name: "Sandbox" } },
                ]),
              },
            ],
          },
        },
      ],
    });

    expect(normalized.datasources).toHaveLength(1);
    expect(normalized.datasources[0]?.name).toBe("Tableau Public Per Day(2025/04-)");
    expect(normalized.datasources[0]?.id).toBe("ds-target");
    expect(normalized.datasources[0]?.luid).toBe("ds-target");
  });
});
