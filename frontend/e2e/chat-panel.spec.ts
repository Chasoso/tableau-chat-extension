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

  await page.route("**/api/notion/status", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        connected: false,
        status: "disconnected",
        targetParentPageIdConfigured: true,
        targetDatabaseIdConfigured: false,
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
          "## Summary",
          "",
          "This is a mocked assistant response for UI verification.",
          "",
          "- Uses dashboard context",
          "- Returns concise recommendations",
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

    await expect(page.locator(".chat-panel")).toBeVisible();
    await expect(page.locator(".question-starters")).toBeVisible();
    await expect(page.locator(".starter-chip-row button")).toHaveCount(3);

    await expect(page.getByText("Mock Executive Sales Dashboard")).toHaveCount(0);
    await expect(page.getByText("Mock Sales Workbook")).toHaveCount(0);

    const panelOverflow = await page.locator(".chat-panel").evaluate((element) => getComputedStyle(element).overflow);
    const messageListOverflow = await page.locator(".message-list").evaluate((element) => getComputedStyle(element).overflowY);

    expect(panelOverflow).toBe("hidden");
    expect(messageListOverflow).toBe("auto");
  });

  test("sends a starter question and renders markdown assistant output", async ({ page }) => {
    await mockAssistantApis(page);
    await page.goto("/");

    await page.locator(".starter-chip-row button").first().click();

    await expect(page.locator(".message-bubble.user")).toHaveCount(1);
    await expect(page.locator(".message-bubble.assistant")).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "Summary" })).toBeVisible();
    await expect(page.getByText("This is a mocked assistant response for UI verification.")).toBeVisible();
    await expect(page.locator(".question-starters")).toHaveCount(0);
  });

  test("submits a typed question with Enter", async ({ page }) => {
    await mockAssistantApis(page);
    await page.goto("/");

    const input = page.locator(".message-input textarea");
    await input.fill("How is the trend this week?");
    await input.press("Enter");

    await expect(page.getByText("How is the trend this week?")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Summary" })).toBeVisible();
    await expect(input).toHaveValue("");
  });

  test("activates send button only when input has non-whitespace characters", async ({ page }) => {
    await mockAssistantApis(page);
    await page.goto("/");

    const sendButton = page.locator(".message-input button");
    const input = page.locator(".message-input textarea");

    await expect(sendButton).toBeDisabled();
    await input.fill("   ");
    await expect(sendButton).toBeDisabled();

    await input.fill("確認したいです");
    await expect(sendButton).toBeEnabled();
  });
});
