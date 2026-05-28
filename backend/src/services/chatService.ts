import { randomUUID } from "node:crypto";
import { getConfig } from "../config";
import { logInfo, safeHash } from "../logging";
import { createChatHistoryRepository, type ChatHistoryRepository } from "../repositories/chatHistoryRepository";
import { DirectTableauApiContextProvider } from "../tableau/directTableauApiContextProvider";
import { MockTableauContextProvider } from "../tableau/mockTableauContextProvider";
import { TableauMcpContextProvider } from "../tableau/tableauMcpContextProvider";
import type { TableauContextProvider } from "../tableau/contextProvider";
import type { AuthenticatedUser } from "../types/auth";
import type { ChatRequest, ChatResponse, ContextRequest, ContextResponse } from "../types/chat";
import type { DashboardContext } from "../types/tableau";
import { BedrockAnswerGenerator, MockAnswerGenerator, type AnswerGenerator } from "./answerGenerator";
import { buildPrompt } from "./promptBuilder";

export class ChatService {
  constructor(
    private readonly contextProvider: TableauContextProvider,
    private readonly answerGenerator: AnswerGenerator,
    private readonly repository: ChatHistoryRepository,
  ) {}

  async generateAnswer(request: ChatRequest, authenticatedUser?: AuthenticatedUser): Promise<ChatResponse> {
    const config = getConfig();
    const sessionId = request.sessionId || randomUUID();
    const messageId = randomUUID();
    const tableauSubject = resolveTableauSubject(authenticatedUser);
    const ownerUserId = authenticatedUser?.userId;
    const recentHistory = await this.repository.listRecentBySession({
      sessionId,
      ownerUserId,
      limit: config.chatMemoryMessageLimit,
    });
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
      historyCount: recentHistory.length,
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
      hasMetadata: hasResolvedMetadata(additionalContext),
      warningCount: additionalContext.warnings?.length ?? 0,
    });
    const prompt = buildPrompt(request, additionalContext, recentHistory);
    const answer = await this.answerGenerator.generate({
      request,
      prompt,
      additionalContext,
    });
    const dashboardContextPatch = buildDashboardContextPatch(request, additionalContext);
    if (dashboardContextPatch?.workbookName) {
      logInfo("chat.service.dashboard_context_patch.created", {
        provider: additionalContext.provider,
        sessionId,
        messageId,
        patchedFields: ["workbookName"],
      });
    }
    const createdAt = new Date().toISOString();

    await this.repository.save({
      sessionId,
      messageId,
      ownerUserId: ownerUserId ?? null,
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
      dashboardContextPatch,
      debug: {
        usedMock: this.answerGenerator.name === "mock",
        tableauContextProvider: additionalContext.provider,
        ...(config.tableau.mcp.debugLogResults
          ? {
              mcpExecutionDebug: additionalContext.mcpExecutionDebug,
              mcpObservations: additionalContext.mcpObservations,
            }
          : {}),
      },
    };
  }

  async getDashboardContextPatch(
    request: ContextRequest,
    authenticatedUser?: AuthenticatedUser,
  ): Promise<ContextResponse> {
    const tableauSubject = resolveTableauSubject(authenticatedUser);
    logInfo("chat.service.context_patch.started", {
      provider: this.contextProvider.name,
      dashboardName: request.dashboardContext.dashboardName,
      workbookNamePresent: Boolean(request.dashboardContext.workbookName),
      worksheetCount: request.dashboardContext.worksheets.length,
      authenticated: Boolean(authenticatedUser),
      authTokenUse: authenticatedUser?.tokenUse,
      hasAuthenticatedEmail: Boolean(authenticatedUser?.email),
      tableauSubjectHash: safeHash(tableauSubject),
    });

    const additionalContext = await this.contextProvider.getAdditionalContext({
      dashboardContext: request.dashboardContext,
      question: "Resolve dashboard context for Tableau Assistant UI.",
      authenticatedUser,
      tableauSubject,
    });
    const dashboardContextPatch = buildDashboardContextPatch(request, additionalContext);

    logInfo("chat.service.context_patch.completed", {
      provider: additionalContext.provider,
      patchedFields: dashboardContextPatch?.workbookName ? ["workbookName"] : [],
      warningCount: additionalContext.warnings?.length ?? 0,
    });

    return {
      dashboardContextPatch,
      debug: {
        tableauContextProvider: additionalContext.provider,
      },
    };
  }
}

function hasResolvedMetadata(additionalContext: Awaited<ReturnType<TableauContextProvider["getAdditionalContext"]>>): boolean {
  if (additionalContext.provider === "tableau-mcp") {
    const metadata = additionalContext.metadata as Record<string, unknown> | undefined;
    if (typeof metadata?.hasMetadata === "boolean") {
      return metadata.hasMetadata;
    }

    return additionalContext.mcpToolResults?.some(
      (result) => result.toolName === "get-datasource-metadata" && result.status === "success",
    ) ?? false;
  }

  return Boolean(additionalContext.metadata);
}

function buildDashboardContextPatch(
  request: { dashboardContext: DashboardContext },
  additionalContext: Awaited<ReturnType<TableauContextProvider["getAdditionalContext"]>>,
): ChatResponse["dashboardContextPatch"] {
  if (request.dashboardContext.workbookName) {
    return undefined;
  }

  const workbookName = extractName(additionalContext.workbook) ?? extractWorkbookNameFromMetadata(additionalContext.metadata);
  if (!workbookName || isLikelyDashboardOrWorksheetName(workbookName, request.dashboardContext)) {
    return undefined;
  }

  return { workbookName };
}

function isLikelyDashboardOrWorksheetName(workbookName: string, dashboardContext: DashboardContext): boolean {
  const normalizedWorkbookName = workbookName.trim().toLowerCase();
  if (!normalizedWorkbookName) {
    return true;
  }

  const knownNonWorkbookNames = [
    dashboardContext.dashboardName,
    ...dashboardContext.worksheets.map((worksheet) => worksheet.name),
  ].map((value) => value.trim().toLowerCase());

  return knownNonWorkbookNames.includes(normalizedWorkbookName);
}

function extractWorkbookNameFromMetadata(value: unknown): string | undefined {
  const dashboards = findArraysByKey(value, "dashboards").flat();
  for (const dashboard of dashboards) {
    if (!dashboard || typeof dashboard !== "object") {
      continue;
    }

    const workbookName = extractName((dashboard as Record<string, unknown>).workbook);
    if (workbookName) {
      return workbookName;
    }
  }

  const workbooks = findArraysByKey(value, "workbooks").flat();
  for (const workbook of workbooks) {
    const workbookName = extractName(workbook);
    if (workbookName) {
      return workbookName;
    }
  }

  return undefined;
}

function findArraysByKey(value: unknown, key: string): unknown[][] {
  if (!value || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => findArraysByKey(item, key));
  }

  const record = value as Record<string, unknown>;
  const direct = Array.isArray(record[key]) ? [record[key] as unknown[]] : [];
  return [...direct, ...Object.values(record).flatMap((item) => findArraysByKey(item, key))];
}

function extractName(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const name = (value as Record<string, unknown>).name;
  return typeof name === "string" && name.trim() ? name.trim() : undefined;
}

export function createChatService(): ChatService {
  const config = getConfig();
  const provider = createContextProvider(config.tableau.contextProvider);
  const answerGenerator = createAnswerGenerator(config.model.provider);

  return new ChatService(provider, answerGenerator, createChatHistoryRepository());
}

function createAnswerGenerator(providerName: ReturnType<typeof getConfig>["model"]["provider"]): AnswerGenerator {
  switch (providerName) {
    case "bedrock":
      return new BedrockAnswerGenerator();
    case "mock":
    default:
      return new MockAnswerGenerator();
  }
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
