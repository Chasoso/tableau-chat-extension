import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MessageList from "./MessageList";

describe("MessageList", () => {
  it("renders markdown assistant output and loading state", () => {
    render(
      <MessageList
        messages={[
          {
            id: "assistant-1",
            role: "assistant",
            content: "## Summary\n\n- Point A",
            createdAt: new Date().toISOString(),
          },
        ]}
        isLoading
        loadingText="データを確認しています…"
      />,
    );

    expect(screen.getByRole("heading", { name: "Summary" })).toBeVisible();
    expect(screen.getByText("Point A")).toBeVisible();
    expect(screen.getByText("データを確認しています…")).toBeVisible();
  });

  it("shows a job progress card with recent progress details", () => {
    render(
      <MessageList
        messages={[]}
        isLoading={true}
        job={{
          status: "running",
          stage: "running_mcp_tools",
          progressMessages: [
            {
              at: new Date().toISOString(),
              stage: "loading_dashboard_context",
              message: "ダッシュボードを確認中です。",
              debug: {
                provider: "tableau-mcp",
                passCount: 2,
                toolCallCount: 4,
              },
            },
          ],
        }}
      />,
    );

    expect(screen.getByRole("region", { name: /分析の進捗/i })).toBeVisible();
    expect(screen.getByText("実行中")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "MCPツールを実行中" }),
    ).toBeVisible();
    expect(screen.getAllByText("ダッシュボードを確認中です。")).toHaveLength(2);
    expect(screen.getByText("pass 2")).toBeVisible();
    expect(screen.getByText("tools 4")).toBeVisible();
    expect(screen.getByText("provider tableau-mcp")).toBeVisible();
  });

  it("shows notion completion details when expanded", () => {
    const onToggle = vi.fn();

    render(
      <MessageList
        messages={[]}
        isLoading={false}
        notionCompletion={{
          title: "分析メモ",
          summary: "要約テキスト",
          pageUrl: "https://www.notion.so/example",
          expanded: true,
        }}
        onToggleNotionCompletion={onToggle}
      />,
    );

    expect(screen.getByLabelText("Notion完了")).toBeVisible();
    expect(screen.getByText("分析メモ")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Notionページを開く" }),
    ).toHaveAttribute("href", "https://www.notion.so/example");
  });
});
