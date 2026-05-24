import { describe, expect, it } from "vitest";
import { InMemoryChatHistoryRepository } from "../src/repositories/chatHistoryRepository";
import { ChatService } from "../src/services/chatService";
import { MockAnswerGenerator } from "../src/services/answerGenerator";
import { MockTableauContextProvider } from "../src/tableau/mockTableauContextProvider";

describe("ChatService with mock provider", () => {
  it("returns a mock answer and saves chat history", async () => {
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

    expect(response.answer).toContain("含まれるワークシートは 2 個");
    expect(response.answer).toContain("Sheet 1, Sheet 2");
    expect(response.debug?.usedMock).toBe(true);
    expect(response.debug?.tableauContextProvider).toBe("mock");
    expect(repository.getAll()).toHaveLength(1);
  });
});
