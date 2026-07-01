import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const createChatServiceMock = vi.fn(() => ({
    generateAnswer: vi.fn(),
    getDashboardContextPatch: vi.fn(),
  }));
  const chatJobServiceImplementation = {
    createChatJob: vi.fn(),
    getChatJob: vi.fn(),
  };

  return {
    createChatServiceMock,
    chatJobServiceImplementation,
  };
});

vi.mock("../src/services/chatService", () => ({
  createChatService: mocks.createChatServiceMock,
}));

vi.mock("../src/services/chatJobService", () => ({
  ChatJobService: vi
    .fn()
    .mockImplementation(() => mocks.chatJobServiceImplementation),
}));

import { handler } from "../src/handlers/chatHandler";

describe("chatHandler", () => {
  const originalAuthRequired = process.env.AUTH_REQUIRED;
  const originalNotionEnabled = process.env.NOTION_MCP_ENABLED;

  beforeEach(() => {
    delete process.env.AUTH_REQUIRED;
    delete process.env.NOTION_MCP_ENABLED;
    mocks.createChatServiceMock.mockClear();
    mocks.chatJobServiceImplementation.createChatJob.mockClear();
    mocks.chatJobServiceImplementation.getChatJob.mockClear();
  });

  afterEach(() => {
    if (originalAuthRequired === undefined) {
      delete process.env.AUTH_REQUIRED;
    } else {
      process.env.AUTH_REQUIRED = originalAuthRequired;
    }

    if (originalNotionEnabled === undefined) {
      delete process.env.NOTION_MCP_ENABLED;
    } else {
      process.env.NOTION_MCP_ENABLED = originalNotionEnabled;
    }
  });

  it("returns 400 when question is empty", async () => {
    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({
        question: "",
        dashboardContext: {
          dashboardName: "Dashboard",
          worksheets: [],
          filters: [],
          parameters: [],
          capturedAt: new Date().toISOString(),
        },
      }),
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBe("question is required.");
  });

  it("returns 401 when auth is required and authorization header is missing", async () => {
    process.env.AUTH_REQUIRED = "true";

    const response = await handler({
      httpMethod: "POST",
      headers: {},
      body: JSON.stringify({
        question: "What is this dashboard?",
        dashboardContext: {
          dashboardName: "Dashboard",
          worksheets: [],
          filters: [],
          parameters: [],
          capturedAt: new Date().toISOString(),
        },
      }),
    });

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body).message).toBe(
      "Authentication is required.",
    );
  });

  it("returns 403 for notion routes when notion integration is disabled", async () => {
    process.env.NOTION_MCP_ENABLED = "false";
    const response = await handler({
      httpMethod: "GET",
      rawPath: "/notion/status",
      headers: {},
    });

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).message).toContain("disabled");
  });

  it("does not require authorization header for notion callback route", async () => {
    process.env.AUTH_REQUIRED = "true";
    process.env.NOTION_MCP_ENABLED = "true";

    const response = await handler({
      httpMethod: "GET",
      rawPath: "/notion/callback",
      queryStringParameters: {
        code: "dummy",
        state: "dummy",
      },
      headers: {},
    });

    expect(response.statusCode).not.toBe(401);
  });

  it("does not require authorization header for cognito popup auth routes", async () => {
    process.env.AUTH_REQUIRED = "true";
    process.env.COGNITO_CLIENT_ID = "client-123";
    process.env.COGNITO_DOMAIN =
      "https://demo.auth.ap-northeast-1.amazoncognito.com";
    process.env.COGNITO_POPUP_REDIRECT_URI =
      "https://example.com/api/auth/cognito/callback";

    const response = await handler({
      httpMethod: "POST",
      rawPath: "/auth/cognito/popup/start",
      headers: {},
      body: JSON.stringify({}),
    });

    expect(response.statusCode).not.toBe(401);
  });

  it("resolves selected-mark intent without invoking chat services", async () => {
    const response = await handler({
      httpMethod: "POST",
      rawPath: "/intent/resolve",
      headers: {},
      body: JSON.stringify({
        actionId: "explain_selection",
        requestedIntent: "selected_mark_explanation",
        message: "Explain this selection.",
        clientTimestamp: "2026-06-30T00:00:00.000Z",
        contextSummary: {
          hasSelectedMarks: true,
          selectedMarkCount: 3,
          worksheetNames: ["Sales Trend"],
          dashboardName: "Executive Overview",
          workbookName: "Sales Workbook",
          viewName: "Executive Overview",
        },
        metadata: {
          sourceKind: "tableau-extension",
        },
      }),
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      result?: {
        resolvedIntentId?: string;
        status?: string;
        source?: string;
      };
    };
    expect(body.result).toMatchObject({
      resolvedIntentId: "selected_mark_explanation",
      status: "resolved",
      source: "explicit",
    });
    expect(mocks.createChatServiceMock).not.toHaveBeenCalled();
    expect(
      mocks.chatJobServiceImplementation.createChatJob,
    ).not.toHaveBeenCalled();
  });

  it("runs selected-mark orchestration when requested without invoking chat services", async () => {
    const response = await handler({
      httpMethod: "POST",
      rawPath: "/intent/resolve",
      headers: {},
      body: JSON.stringify({
        actionId: "explain_selection",
        requestedIntent: "selected_mark_explanation",
        runMode: "resolve_and_execute_fixed_plan",
        message: "Explain this selection.",
        clientTimestamp: "2026-06-30T00:00:00.000Z",
        contextSummary: {
          hasSelectedMarks: true,
          selectedMarkCount: 3,
          worksheetNames: ["Sales Trend"],
          dashboardName: "Executive Overview",
          workbookName: "Sales Workbook",
          viewName: "Executive Overview",
        },
        metadata: {
          sourceKind: "tableau-extension",
        },
      }),
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      result?: {
        resolvedIntentId?: string;
        status?: string;
      };
      orchestration?: {
        status?: string;
        message?: string;
        placeholderResponse?: string;
        planSelection?: {
          selectedPlan?: {
            id?: string;
          };
        };
        execution?: {
          status?: string;
          budgetUsage?: {
            maxToolCalls?: number;
          };
        };
        traceEvents?: unknown[];
        traceMetadata?: {
          runner?: {
            kind?: string;
          };
          agentRun?: {
            status?: string;
          };
        };
      };
    };

    expect(body.result).toMatchObject({
      resolvedIntentId: "selected_mark_explanation",
      status: "resolved",
    });
    expect(body.orchestration).toMatchObject({
      status: "partial",
      planSelection: {
        selectedPlan: {
          id: "selected_mark_explanation-v1",
        },
      },
      execution: {
        status: "partial",
      },
    });
    expect(body.orchestration?.placeholderResponse).toContain(
      "Structured orchestration",
    );
    expect(Array.isArray(body.orchestration?.traceEvents)).toBe(true);
    expect(body.orchestration?.traceEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "run_started" }),
        expect.objectContaining({ type: "run_completed" }),
      ]),
    );
    expect(body.orchestration?.traceMetadata).toMatchObject({
      runner: {
        kind: "lambda",
      },
      agentRun: {
        status: "partial",
      },
    });
    expect(mocks.createChatServiceMock).not.toHaveBeenCalled();
    expect(
      mocks.chatJobServiceImplementation.createChatJob,
    ).not.toHaveBeenCalled();
  });
});
