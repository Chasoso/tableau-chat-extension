import { randomUUID } from "node:crypto";
import { getConfig } from "../config";
import { createChatHistoryRepository, type ChatHistoryRepository } from "../repositories/chatHistoryRepository";
import { DirectTableauApiContextProvider } from "../tableau/directTableauApiContextProvider";
import { MockTableauContextProvider } from "../tableau/mockTableauContextProvider";
import type { TableauContextProvider } from "../tableau/contextProvider";
import type { ChatRequest, ChatResponse } from "../types/chat";
import { MockAnswerGenerator, type AnswerGenerator } from "./answerGenerator";
import { buildPrompt } from "./promptBuilder";

export class ChatService {
  constructor(
    private readonly contextProvider: TableauContextProvider,
    private readonly answerGenerator: AnswerGenerator,
    private readonly repository: ChatHistoryRepository,
  ) {}

  async generateAnswer(request: ChatRequest): Promise<ChatResponse> {
    const sessionId = request.sessionId || randomUUID();
    const messageId = randomUUID();
    const additionalContext = await this.contextProvider.getAdditionalContext({
      dashboardContext: request.dashboardContext,
      question: request.question,
    });
    const prompt = buildPrompt(request, additionalContext);
    const answer = await this.answerGenerator.generate({
      request,
      prompt,
      additionalContext,
    });
    const createdAt = new Date().toISOString();

    await this.repository.save({
      sessionId,
      messageId,
      question: request.question,
      answer,
      dashboardName: request.dashboardContext.dashboardName,
      workbookName: request.dashboardContext.workbookName ?? null,
      worksheetNames: request.dashboardContext.worksheets.map((worksheet) => worksheet.name),
      createdAt,
      source: request.clientContext?.source,
    });

    return {
      answer,
      sessionId,
      messageId,
      debug: {
        usedMock: this.answerGenerator.name === "mock",
        tableauContextProvider: additionalContext.provider,
      },
    };
  }
}

export function createChatService(): ChatService {
  const provider = process.env.TABLEAU_CONTEXT_PROVIDER === "direct"
    ? new DirectTableauApiContextProvider()
    : new MockTableauContextProvider();

  return new ChatService(provider, new MockAnswerGenerator(), createChatHistoryRepository());
}

void getConfig;

