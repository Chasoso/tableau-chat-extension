import { randomUUID } from "node:crypto";
import { getConfig } from "../config";
import { logInfo, safeHash } from "../logging";
import { createChatHistoryRepository, type ChatHistoryRepository } from "../repositories/chatHistoryRepository";
import { DirectTableauApiContextProvider } from "../tableau/directTableauApiContextProvider";
import { MockTableauContextProvider } from "../tableau/mockTableauContextProvider";
import { TableauMcpContextProvider } from "../tableau/tableauMcpContextProvider";
import type { TableauContextProvider } from "../tableau/contextProvider";
import type { AuthenticatedUser } from "../types/auth";
import type { ChatRequest, ChatResponse } from "../types/chat";
import { MockAnswerGenerator, type AnswerGenerator } from "./answerGenerator";
import { buildPrompt } from "./promptBuilder";

export class ChatService {
  constructor(
    private readonly contextProvider: TableauContextProvider,
    private readonly answerGenerator: AnswerGenerator,
    private readonly repository: ChatHistoryRepository,
  ) {}

  async generateAnswer(request: ChatRequest, authenticatedUser?: AuthenticatedUser): Promise<ChatResponse> {
    const sessionId = request.sessionId || randomUUID();
    const messageId = randomUUID();
    const tableauSubject = resolveTableauSubject(authenticatedUser);
    logInfo("chat.service.context_lookup.started", {
      provider: this.contextProvider.name,
      sessionId,
      messageId,
      dashboardName: request.dashboardContext.dashboardName,
      worksheetCount: request.dashboardContext.worksheets.length,
      filterCount: request.dashboardContext.filters.length,
      parameterCount: request.dashboardContext.parameters.length,
      authenticated: Boolean(authenticatedUser),
      authTokenUse: authenticatedUser?.tokenUse,
      hasAuthenticatedEmail: Boolean(authenticatedUser?.email),
      tableauSubjectHash: safeHash(tableauSubject),
    });
    const additionalContext = await this.contextProvider.getAdditionalContext({
      dashboardContext: request.dashboardContext,
      question: request.question,
      authenticatedUser,
      tableauSubject,
    });
    logInfo("chat.service.context_lookup.completed", {
      provider: additionalContext.provider,
      sessionId,
      messageId,
      datasourceCount: additionalContext.datasources?.length ?? 0,
      hasWorkbook: Boolean(additionalContext.workbook),
      hasMetadata: Boolean(additionalContext.metadata),
      warningCount: additionalContext.warnings?.length ?? 0,
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
  const config = getConfig();
  const provider = createContextProvider(config.tableau.contextProvider);

  return new ChatService(provider, new MockAnswerGenerator(), createChatHistoryRepository());
}

function createContextProvider(providerName: ReturnType<typeof getConfig>["tableau"]["contextProvider"]): TableauContextProvider {
  switch (providerName) {
    case "direct-api":
      return new DirectTableauApiContextProvider();
    case "mcp":
      return new TableauMcpContextProvider();
    case "mock":
    default:
      return new MockTableauContextProvider();
  }
}

function resolveTableauSubject(authenticatedUser: AuthenticatedUser | undefined): string | undefined {
  const config = getConfig();
  return authenticatedUser?.tableauSubject ?? (config.tableau.defaultSubject || undefined);
}
