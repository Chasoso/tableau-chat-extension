import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChatPanel from "./ChatPanel";
import type { DashboardContext } from "../types/tableau";

const mocks = vi.hoisted(() => ({
  createChatJob: vi.fn(),
  getChatJob: vi.fn(),
  loadChatJobOwnerToken: vi.fn(),
  storeChatJobOwnerToken: vi.fn(),
  getNotionStatus: vi.fn(),
}));

vi.mock("../api/chatApi", () => ({
  createChatJob: mocks.createChatJob,
  getChatJob: mocks.getChatJob,
}));

vi.mock("../api/chatJobOwnerToken", () => ({
  loadChatJobOwnerToken: mocks.loadChatJobOwnerToken,
  storeChatJobOwnerToken: mocks.storeChatJobOwnerToken,
}));

vi.mock("../api/notionApi", () => ({
  getNotionStatus: mocks.getNotionStatus,
  savePostIdeaToNotion: vi.fn(),
  startNotionConnect: vi.fn(),
}));

const dashboardContext: DashboardContext = {
  dashboardName: "Overview",
  workbookName: "Sales Workbook",
  worksheets: [
    {
      name: "Summary",
    },
  ],
  filters: [],
  parameters: [],
  capturedAt: "2026-06-07T00:00:00.000Z",
};

beforeEach(() => {
  mocks.createChatJob.mockReset();
  mocks.getChatJob.mockReset();
  mocks.loadChatJobOwnerToken.mockReset();
  mocks.storeChatJobOwnerToken.mockReset();
  mocks.getNotionStatus.mockReset();

  mocks.loadChatJobOwnerToken.mockReturnValue(null);
  mocks.getNotionStatus.mockResolvedValue({
    connected: false,
    targetParentPageIdConfigured: false,
    targetDatabaseIdConfigured: false,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("ChatPanel", () => {
  it("creates a job, polls it, and renders the final answer", async () => {
    const user = userEvent.setup();
    const createdAt = "2026-06-07T00:00:01.000Z";

    mocks.createChatJob.mockResolvedValue({
      jobId: "job-1",
      status: "queued",
      stage: "queued",
      pollUrl: "/chat-jobs/job-1",
      retryAfterMs: 1500,
      ownerToken: "owner-token-1",
    });

    mocks.getChatJob.mockResolvedValue({
      jobId: "job-1",
      status: "completed",
      stage: "completed",
      progressMessages: [
        {
          at: createdAt,
          stage: "loading_dashboard_context",
          message: "ダッシュボードを確認中です。",
          debug: {
            provider: "tableau-mcp",
            toolCallCount: 2,
          },
        },
      ],
      result: {
        answer: "分析結果です。",
        sessionId: "session-1",
        messageId: "message-1",
      },
      createdAt,
      updatedAt: createdAt,
      expiresAt: 1_999_999_999,
      ownerType: "anonymous",
    });

    render(<ChatPanel dashboardContext={dashboardContext} isAuthenticated />);

    await user.type(
      screen.getByLabelText("質問"),
      "このダッシュボードを要約して",
    );
    await user.click(screen.getByRole("button", { name: "送信" }));

    await waitFor(() =>
      expect(screen.getByText("分析結果です。")).toBeVisible(),
    );

    expect(mocks.createChatJob).toHaveBeenCalledWith(
      expect.objectContaining({
        question: "このダッシュボードを要約して",
        sessionId: undefined,
      }),
      undefined,
      undefined,
    );
    expect(mocks.getChatJob).toHaveBeenCalledWith(
      "job-1",
      undefined,
      "owner-token-1",
    );
    expect(mocks.storeChatJobOwnerToken).toHaveBeenCalledWith("owner-token-1");
  });

  it("shows an error and stops polling when the job fails", async () => {
    const user = userEvent.setup();

    mocks.createChatJob.mockResolvedValue({
      jobId: "job-failed",
      status: "queued",
      stage: "queued",
      pollUrl: "/chat-jobs/job-failed",
      retryAfterMs: 1500,
      ownerToken: "owner-token-failed",
    });

    mocks.getChatJob.mockResolvedValue({
      jobId: "job-failed",
      status: "failed",
      stage: "failed",
      progressMessages: [
        {
          at: "2026-06-07T00:00:01.000Z",
          stage: "planning",
          message: "Planning failed.",
          debug: {
            provider: "tableau-mcp",
          },
        },
      ],
      error: {
        code: "worker_failed",
        message: "Worker failed.",
      },
      createdAt: "2026-06-07T00:00:00.000Z",
      updatedAt: "2026-06-07T00:00:02.000Z",
      expiresAt: 1_999_999_999,
      ownerType: "anonymous",
    });

    render(<ChatPanel dashboardContext={dashboardContext} isAuthenticated />);

    await user.type(screen.getByLabelText("質問"), "What changed?");
    await user.click(screen.getByRole("button", { name: "送信" }));

    await waitFor(() =>
      expect(
        screen.getByText("Worker failed.", { selector: ".error-banner" }),
      ).toBeVisible(),
    );

    expect(mocks.getChatJob).toHaveBeenCalledWith(
      "job-failed",
      undefined,
      "owner-token-failed",
    );
    expect(mocks.storeChatJobOwnerToken).toHaveBeenCalledWith(
      "owner-token-failed",
    );
  });
});
