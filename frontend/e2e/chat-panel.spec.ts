import { expect, test, type Page } from "@playwright/test";

async function mockAssistantApis(page: Page) {
  await page.route("**/api/context", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        dashboardContextPatch: {
          workbookName: "Mock Sales Workbook",
        },
        debug: {
          tableauContextProvider: "mock",
        },
      }),
    });
  });

  await page.route("**/api/chat", async (route) => {
    const requestBody = route.request().postDataJSON() as {
      question?: string;
      dashboardContext?: unknown;
    };

    expect(requestBody.question).toBeTruthy();
    expect(requestBody.dashboardContext).toBeTruthy();

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        answer: [
          "## 回答",
          "",
          "このダッシュボードについて、取得済みコンテキストを使って回答します。",
          "",
          "- シートやフィルターの詳細は通常UIには常時表示しません。",
          "- 必要な情報だけを会話内で説明します。",
        ].join("\n"),
        sessionId: "test-session",
        messageId: "test-message",
        debug: {
          usedMock: true,
          tableauContextProvider: "mock",
        },
      }),
    });
  });
}

test.describe("chat panel", () => {
  test("shows a lightweight question panel without dashboard metadata cards", async ({ page }) => {
    await mockAssistantApis(page);
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "質問" })).toBeVisible();
    await expect(page.getByText("表示中のダッシュボードについて聞けます")).toBeVisible();
    await expect(page.getByRole("button", { name: "概要を教えて" })).toBeVisible();
    await expect(page.getByRole("button", { name: "傾向を教えて" })).toBeVisible();

    await expect(page.getByText("Mock Executive Sales Dashboard")).toHaveCount(0);
    await expect(page.getByText("Mock Sales Workbook")).toHaveCount(0);
    await expect(page.getByText("ワークブック")).toHaveCount(0);
    await expect(page.getByText("フィルター")).toHaveCount(0);

    const panelOverflow = await page.locator(".chat-panel").evaluate((element) => getComputedStyle(element).overflow);
    const messageListOverflow = await page.locator(".message-list").evaluate((element) => getComputedStyle(element).overflowY);

    expect(panelOverflow).toBe("hidden");
    expect(messageListOverflow).toBe("auto");
  });

  test("sends a starter question and renders markdown assistant output", async ({ page }) => {
    await mockAssistantApis(page);
    await page.goto("/");

    await page.getByRole("button", { name: "概要を教えて" }).click();

    await expect(page.getByText("あなた")).toBeVisible();
    await expect(page.getByText("概要を教えて")).toBeVisible();
    await expect(page.getByRole("heading", { name: "回答" })).toBeVisible();
    await expect(page.getByText("必要な情報だけを会話内で説明します。")).toBeVisible();
    await expect(page.getByRole("button", { name: "概要を教えて" })).toHaveCount(0);
  });

  test("submits a typed question with Enter", async ({ page }) => {
    await mockAssistantApis(page);
    await page.goto("/");

    const input = page.getByRole("textbox", { name: "質問" });
    await input.fill("この数値の意味は？");
    await input.press("Enter");

    await expect(page.getByText("この数値の意味は？")).toBeVisible();
    await expect(page.getByRole("heading", { name: "回答" })).toBeVisible();
    await expect(input).toHaveValue("");
  });
});
