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
        loadingText="確認しています…"
      />,
    );

    expect(screen.getByRole("heading", { name: "Summary" })).toBeVisible();
    expect(screen.getByText("Point A")).toBeVisible();
    expect(screen.getByText("確認しています…")).toBeVisible();
  });

  it("shows notion completion details when expanded", () => {
    const onToggle = vi.fn();

    render(
      <MessageList
        messages={[]}
        isLoading={false}
        notionCompletion={{
          title: "保存済みタイトル",
          summary: "保存内容の要約",
          pageUrl: "https://www.notion.so/example",
          expanded: true,
        }}
        onToggleNotionCompletion={onToggle}
      />,
    );

    expect(screen.getByLabelText("Notion保存完了")).toBeVisible();
    expect(screen.getByText("保存済みタイトル")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Notionページを開く" }),
    ).toHaveAttribute("href", "https://www.notion.so/example");
  });
});
