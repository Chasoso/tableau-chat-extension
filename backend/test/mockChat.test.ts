import { describe, expect, it } from "vitest";
import { InMemoryChatHistoryRepository } from "../src/repositories/chatHistoryRepository";
import type { AnswerGenerator } from "../src/services/answerGenerator";
import { MockAnswerGenerator } from "../src/services/answerGenerator";
import { ChatService, sanitizeUserFacingAnswer } from "../src/services/chatService";
import { MockTableauContextProvider } from "../src/tableau/mockTableauContextProvider";
import type { AuthenticatedUser } from "../src/types/auth";

describe("ChatService with mock provider", () => {
  it("returns a context-based answer and saves chat history", async () => {
    const repository = new InMemoryChatHistoryRepository();
    const service = new ChatService(new MockTableauContextProvider(), new MockAnswerGenerator(), repository);

    const response = await service.generateAnswer({
      question: "Summarize this dashboard",
      dashboardContext: {
        dashboardName: "Mock Dashboard",
        workbookName: "Mock Workbook",
        worksheets: [{ name: "Sheet 1" }, { name: "Sheet 2" }],
        filters: [],
        parameters: [],
        capturedAt: new Date().toISOString(),
      },
      clientContext: {
        source: "tableau-extension",
      },
    });

    expect(response.answer).toContain("Sheet 1, Sheet 2");
    expect(response.debug?.usedMock).toBe(true);
    expect(response.debug?.tableauContextProvider).toBe("mock");
    expect(repository.getAll()).toHaveLength(1);
  });

  it("reuses recent session history only for the same authenticated user", async () => {
    const repository = new InMemoryChatHistoryRepository();
    const provider = new MockTableauContextProvider();
    const userA: AuthenticatedUser = {
      userId: "user-a",
      email: "user-a@example.com",
      tableauSubject: "user-a@example.com",
      tokenUse: "id",
    };
    const userB: AuthenticatedUser = {
      userId: "user-b",
      email: "user-b@example.com",
      tableauSubject: "user-b@example.com",
      tokenUse: "id",
    };

    let callCount = 0;
    const answerGenerator: AnswerGenerator = {
      name: "mock",
      async generate({ prompt }) {
        callCount += 1;
        return callCount === 1 ? "First answer" : prompt;
      },
    };

    const service = new ChatService(provider, answerGenerator, repository);
    const dashboardContext = {
      dashboardName: "Mock Dashboard",
      workbookName: "Mock Workbook",
      worksheets: [{ name: "Sheet 1" }],
      filters: [],
      parameters: [],
      capturedAt: new Date().toISOString(),
    };

    const firstResponse = await service.generateAnswer(
      {
        question: "First question",
        dashboardContext,
        clientContext: {
          source: "tableau-extension",
        },
      },
      userA,
    );

    const secondResponse = await service.generateAnswer(
      {
        question: "Second question",
        dashboardContext,
        clientContext: {
          source: "tableau-extension",
        },
        sessionId: firstResponse.sessionId,
      },
      userA,
    );

    expect(secondResponse.answer).toContain("Turn 1 user: First question");
    expect(secondResponse.answer).toContain("Turn 1 assistant: First answer");

    const otherUserResponse = await service.generateAnswer(
      {
        question: "Third question",
        dashboardContext,
        clientContext: {
          source: "tableau-extension",
        },
        sessionId: firstResponse.sessionId,
      },
      userB,
    );

    expect(otherUserResponse.answer).not.toContain("Turn 1 user: First question");
    expect(otherUserResponse.answer).not.toContain("Turn 1 assistant: First answer");
  });

  it("sanitizes internal tool instructions in metadata-unavailable answers", () => {
    const sanitized = sanitizeUserFacingAnswer(
      "get-datasource-metadata and query-datasource need datasource-id",
      {
        question: "このダッシュボードで使われているデータソースのフィールドを説明して",
        dashboardContext: {
          dashboardName: "Statistics",
          workbookName: "Tableau Public Insights",
          worksheets: [{ name: "Views" }],
          filters: [],
          parameters: [],
          dataSources: [{ name: "Tableau Public Per Day(2025/04-)" }],
          capturedAt: new Date().toISOString(),
        },
      },
      {
        provider: "tableau-mcp",
        normalizedContext: {
          dashboard: { name: "Statistics" },
          workbook: { type: "workbook", name: "Tableau Public Insights" },
          views: [],
          datasources: [{ type: "datasource", name: "Tableau Public Per Day(2025/04-)" }],
          projects: [],
        },
        mcpExecutionDebug: {
          intent: "metadata_lookup",
          intentConfidence: 0.9,
          answerableFromDashboardContext: false,
          needsMcp: true,
          maxToolCalls: 5,
          plannedTools: [],
          blockedTools: [],
          executedTools: [],
          skippedTools: [],
          toolCallCount: 0,
          replanUsed: true,
          timingMs: { planning: 0, execution: 0 },
        },
        metadata: { hasMetadata: false },
      },
    );

    expect(sanitized).not.toContain("get-datasource-metadata");
    expect(sanitized).not.toContain("query-datasource");
    expect(sanitized).not.toContain("datasource-id");
    expect(sanitized).toContain("このダッシュボードで確認できているデータソース");
  });

  it("replaces hallucinated datasource fields with strict metadata-backed field list", () => {
    const sanitized = sanitizeUserFacingAnswer(
      [
        "| field | type |",
        "| --- | --- |",
        "| workbook_title | string |",
        "| workbook_reactionCounts_LAUGH | number |",
      ].join("\n"),
      {
        question: "このデータソースのフィールドを説明して",
        dashboardContext: {
          dashboardName: "Statistics",
          workbookName: "Tableau Public Insights",
          worksheets: [{ name: "Views" }],
          filters: [],
          parameters: [],
          dataSources: [{ name: "Tableau Public Per Day(2025/04-)" }],
          capturedAt: new Date().toISOString(),
        },
      },
      {
        provider: "tableau-mcp",
        normalizedContext: {
          dashboard: { name: "Statistics" },
          workbook: { type: "workbook", name: "Tableau Public Insights" },
          views: [],
          datasources: [{ type: "datasource", name: "Tableau Public Per Day(2025/04-)" }],
          projects: [],
        },
        datasourceFieldProfiles: [
          {
            datasourceName: "Tableau Public Per Day(2025/04-)",
            fieldNames: ["workbook_title", "workbook_viewCount"],
            fieldCount: 2,
            sourceTool: "get-datasource-metadata",
          },
        ],
        mcpExecutionDebug: {
          intent: "metadata_lookup",
          intentConfidence: 0.9,
          answerableFromDashboardContext: false,
          needsMcp: true,
          maxToolCalls: 5,
          plannedTools: [],
          blockedTools: [],
          executedTools: ["get-datasource-metadata"],
          skippedTools: [],
          toolCallCount: 1,
          replanUsed: false,
          timingMs: { planning: 0, execution: 0 },
        },
        metadata: { hasMetadata: true },
      },
    );

    expect(sanitized).toContain("Tableau Public Per Day(2025/04-)");
    expect(sanitized).toContain("workbook_title");
    expect(sanitized).toContain("workbook_viewCount");
    expect(sanitized).not.toContain("workbook_reactionCounts_LAUGH");
  });

  it("removes manual query instructions when data-analysis query was not executed", () => {
    const sanitized = sanitizeUserFacingAnswer(
      [
        "このデータソースから最上位を求めるには次のクエリを実行してください。",
        "```sql",
        "SELECT workbook_title, workbook_viewCount FROM datasource ORDER BY workbook_viewCount DESC LIMIT 1;",
        "```",
      ].join("\n"),
      {
        question: "viewCountが最も多いworkbookは何か、データソースをクエリして求めてください。",
        dashboardContext: {
          dashboardName: "Statistics",
          worksheets: [{ name: "Views" }],
          filters: [],
          parameters: [],
          dataSources: [{ name: "Tableau Public Per Day(2025/04-)" }],
          capturedAt: new Date().toISOString(),
        },
      },
      {
        provider: "tableau-mcp",
        normalizedContext: {
          dashboard: { name: "Statistics" },
          views: [],
          datasources: [{ type: "datasource", name: "Tableau Public Per Day(2025/04-)" }],
          projects: [],
        },
        mcpExecutionDebug: {
          intent: "data_analysis",
          intentConfidence: 0.89,
          answerableFromDashboardContext: false,
          needsMcp: true,
          maxToolCalls: 8,
          plannedTools: ["list-datasources", "get-datasource-metadata", "query-datasource"],
          blockedTools: [],
          executedTools: ["list-datasources", "get-datasource-metadata"],
          skippedTools: [],
          toolCallCount: 2,
          replanUsed: true,
          timingMs: { planning: 0, execution: 0 },
        },
        mcpToolResults: [
          { toolName: "list-datasources", status: "success" },
          { toolName: "get-datasource-metadata", status: "success" },
        ],
      },
    );

    expect(sanitized).not.toContain("```sql");
    expect(sanitized).not.toContain("SELECT ");
    expect(sanitized).toContain("安全制約により集計クエリを実行できなかった");
  });
});
