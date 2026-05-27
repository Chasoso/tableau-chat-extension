import { describe, expect, it } from "vitest";
import { InMemoryChatHistoryRepository } from "../src/repositories/chatHistoryRepository";
import type { AnswerGenerator } from "../src/services/answerGenerator";
import { MockAnswerGenerator } from "../src/services/answerGenerator";
import { ChatService } from "../src/services/chatService";
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

    expect(response.answer).toContain("含まれるワークシートは 2 個です");
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
});
