import { randomUUID } from "node:crypto";
import { getConfig } from "../config";
import { logDebug, logInfo, logWarn, safeHash } from "../logging";
import {
  createChatHistoryRepository,
  type ChatHistoryRepository,
} from "../repositories/chatHistoryRepository";
import { DirectTableauApiContextProvider } from "../tableau/directTableauApiContextProvider";
import { MockTableauContextProvider } from "../tableau/mockTableauContextProvider";
import { TableauMcpContextProvider } from "../tableau/tableauMcpContextProvider";
import type { TableauContextProvider } from "../tableau/contextProvider";
import type { AuthenticatedUser } from "../types/auth";
import type {
  ChatRequest,
  ChatResponse,
  ContextRequest,
  ContextResponse,
} from "../types/chat";
import type { NotionRankingItem } from "../types/notion";
import type {
  DashboardContext,
  DatasourceFieldProfile,
  QueryDatasourceInsight,
  QuestionInterpretation,
} from "../types/tableau";
import {
  detectRankingIntent,
  interpretQuestion,
  matchesMetricFieldIntent,
  metricIntentLabel,
} from "./questionInterpretation";
import {
  BedrockAnswerGenerator,
  MockAnswerGenerator,
  type AnswerGenerator,
} from "./answerGenerator";
import {
  BedrockChatAgent,
  NoopChatAgent,
  runLightweightAgentLoop,
  type ChatAgent,
} from "./chatAgent";
import {
  createNoopChatProgressReporter,
  type ChatProgressReporter,
} from "./chatProgress";
import { buildPrompt } from "./promptBuilder";

export class ChatService {
  constructor(
    private readonly contextProvider: TableauContextProvider,
    private readonly answerGenerator: AnswerGenerator,
    private readonly repository: ChatHistoryRepository,
    private readonly chatAgent: ChatAgent = new NoopChatAgent(),
  ) {}

  async generateAnswer(
    request: ChatRequest,
    authenticatedUser?: AuthenticatedUser,
    options: {
      getRemainingTimeInMillis?: () => number;
      progressReporter?: ChatProgressReporter;
      conversationOwnerKey?: string;
    } = {},
  ): Promise<ChatResponse> {
    const config = getConfig();
    const sessionId = request.sessionId || randomUUID();
    const messageId = randomUUID();
    const progressReporter =
      options.progressReporter ?? createNoopChatProgressReporter();
    const requestInterpretation = interpretQuestion({
      question: request.question,
      dashboardContext: request.dashboardContext,
    });
    const tableauSubject = resolveTableauSubject(authenticatedUser);
    const ownerUserId =
      options.conversationOwnerKey ?? authenticatedUser?.userId;
    await progressReporter.report({
      stage: "loading_history",
      message: "会話履歴を確認中...",
      debug: {
        sessionId,
        messageId,
      },
    });
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
    logDebug("chat.message.input_debug", {
      sessionId,
      messageId,
      questionLength: request.question.length,
      question: clipForDebugLog(request.question),
    });
    const fastPathAnswer = buildDatasourceInventoryFastPathAnswer(
      request,
      requestInterpretation,
    );
    if (fastPathAnswer) {
      logInfo("chat.service.fast_path_answer.used", {
        sessionId,
        messageId,
        requestType: requestInterpretation.requestType,
        requestTypeConfidence: requestInterpretation.requestTypeConfidence,
        requestTypeSignals: requestInterpretation.requestTypeSignals,
      });
      await progressReporter.report({
        stage: "finalizing",
        message: "回答を保存中...",
        debug: {
          sessionId,
          messageId,
          path: "fast_path",
        },
      });
      return this.persistAndBuildResponse({
        sessionId,
        messageId,
        ownerUserId,
        request,
        answer: fastPathAnswer,
        notionPostIdeaDraft: buildNotionDraft(
          request.question,
          fastPathAnswer,
          request,
          {
            provider: "mock",
            questionInterpretation: requestInterpretation,
          },
        ),
      });
    }
    await progressReporter.report({
      stage: "loading_dashboard_context",
      message: "ダッシュボード情報を取得中...",
      debug: {
        sessionId,
        messageId,
      },
    });
    await progressReporter.report({
      stage: "planning",
      message: "分析計画を作成中...",
      debug: {
        requestType: requestInterpretation.requestType,
        requestTypeConfidence: requestInterpretation.requestTypeConfidence,
        metricIntent: requestInterpretation.metricIntent,
      },
    });
    const agentLoopResult = await runLightweightAgentLoop({
      agent: this.chatAgent,
      contextProvider: this.contextProvider,
      request,
      recentHistory,
      authenticatedUser,
      tableauSubject,
      baseQuestionInterpretation: requestInterpretation,
      getRemainingTimeInMillis: options.getRemainingTimeInMillis,
    });
    const additionalContext = agentLoopResult.additionalContext;
    await progressReporter.report({
      stage: "running_mcp_tools",
      message: "MCP ツールを実行中...",
      toolName:
        additionalContext.mcpExecutionDebug?.executedTools?.at(-1) ??
        additionalContext.mcpExecutionDebug?.plannedTools?.at(0),
      debug: {
        provider: additionalContext.provider,
        toolCallCount: additionalContext.mcpExecutionDebug?.toolCallCount,
        plannedTools: additionalContext.mcpExecutionDebug?.plannedTools,
        executedTools: additionalContext.mcpExecutionDebug?.executedTools,
        replanUsed: additionalContext.mcpExecutionDebug?.replanUsed,
        fallbackReason: additionalContext.mcpExecutionDebug?.fallbackReason,
        passCount: agentLoopResult.debug?.passCount,
      },
    });
    logInfo("chat.service.context_lookup.completed", {
      provider: additionalContext.provider,
      sessionId,
      messageId,
      datasourceCount: additionalContext.datasources?.length ?? 0,
      hasWorkbook: Boolean(additionalContext.workbook),
      hasMetadata: hasResolvedMetadata(additionalContext),
      warningCount: additionalContext.warnings?.length ?? 0,
      agentPassCount: agentLoopResult.debug?.passCount ?? 0,
    });
    const metadataPathAnswer = buildFieldInventoryAnswerFromContext(
      request,
      additionalContext,
    );
    if (metadataPathAnswer) {
      logInfo("chat.service.metadata_path_answer.used", {
        sessionId,
        messageId,
        requestType: additionalContext.questionInterpretation?.requestType,
        fieldProfileCount:
          additionalContext.datasourceFieldProfiles?.length ?? 0,
      });
      await progressReporter.report({
        stage: "finalizing",
        message: "最終結果を保存中...",
        debug: {
          sessionId,
          messageId,
          path: "metadata_fast_path",
        },
      });
      return this.persistAndBuildResponse({
        sessionId,
        messageId,
        ownerUserId,
        request,
        answer: metadataPathAnswer,
        notionPostIdeaDraft: buildNotionDraft(
          request.question,
          metadataPathAnswer,
          request,
          additionalContext,
        ),
        dashboardContextPatch: buildDashboardContextPatch(
          request,
          additionalContext,
        ),
        debug: {
          usedMock: this.answerGenerator.name === "mock",
          tableauContextProvider: additionalContext.provider,
          ...(config.tableau.mcp.debugLogResults
            ? {
                mcpExecutionDebug: additionalContext.mcpExecutionDebug,
                mcpObservations: additionalContext.mcpObservations,
                agentExecutionDebug: agentLoopResult.debug,
              }
            : {}),
        },
      });
    }
    const remainingTimeBeforeAnswer =
      options.getRemainingTimeInMillis?.() ?? Number.POSITIVE_INFINITY;
    if (remainingTimeBeforeAnswer < 8_000) {
      const deadlineFallback = buildDeadlineAwareDeterministicAnswer(
        request,
        additionalContext,
      );
      logWarn("chat.service.answer_generation_skipped_due_to_deadline", {
        sessionId,
        messageId,
        remainingTimeMs: remainingTimeBeforeAnswer,
        provider: additionalContext.provider,
      });
      await progressReporter.report({
        stage: "finalizing",
        message: "最終結果を保存中...",
        debug: {
          sessionId,
          messageId,
          path: "deadline_fallback",
        },
      });
      return this.persistAndBuildResponse({
        sessionId,
        messageId,
        ownerUserId,
        request,
        answer: deadlineFallback,
        notionPostIdeaDraft: buildNotionDraft(
          request.question,
          deadlineFallback,
          request,
          additionalContext,
        ),
        dashboardContextPatch: buildDashboardContextPatch(
          request,
          additionalContext,
        ),
        debug: {
          usedMock: this.answerGenerator.name === "mock",
          tableauContextProvider: additionalContext.provider,
          ...(config.tableau.mcp.debugLogResults
            ? {
                mcpExecutionDebug: additionalContext.mcpExecutionDebug,
                mcpObservations: additionalContext.mcpObservations,
                agentExecutionDebug: agentLoopResult.debug,
              }
            : {}),
        },
      });
    }
    await progressReporter.report({
      stage: "generating_answer",
      message: "回答を生成中...",
      debug: {
        sessionId,
        messageId,
      },
    });
    const prompt = buildPrompt(
      request,
      additionalContext,
      recentHistory,
      agentLoopResult.promptContext,
    );
    const answer = await this.answerGenerator.generate({
      request,
      prompt,
      additionalContext,
    });
    const sanitizedAnswer = finalizeUserFacingAnswer(
      answer,
      request,
      additionalContext,
    );
    const notionPostIdeaDraft = buildNotionDraft(
      request.question,
      sanitizedAnswer,
      request,
      additionalContext,
    );
    logDebug("chat.message.output_debug", {
      sessionId,
      messageId,
      answerLength: sanitizedAnswer.length,
      answer: clipForDebugLog(sanitizedAnswer),
    });
    if (notionPostIdeaDraft) {
      logDebug("chat.notion_draft.generated", {
        sessionId,
        messageId,
        draftKind: notionPostIdeaDraft.draftKind ?? "post_idea",
        titleLength: notionPostIdeaDraft.title.length,
        summaryLength: notionPostIdeaDraft.summary?.length ?? 0,
        analysisBodyLength: notionPostIdeaDraft.analysisBody?.length ?? 0,
      });
    }
    const dashboardContextPatch = buildDashboardContextPatch(
      request,
      additionalContext,
    );
    await progressReporter.report({
      stage: "finalizing",
      message: "最終結果を保存中...",
      debug: {
        sessionId,
        messageId,
      },
    });
    if (dashboardContextPatch?.workbookName) {
      logInfo("chat.service.dashboard_context_patch.created", {
        provider: additionalContext.provider,
        sessionId,
        messageId,
        patchedFields: ["workbookName"],
      });
    }
    const createdAt = new Date().toISOString();
    return this.persistAndBuildResponse({
      sessionId,
      messageId,
      ownerUserId,
      request,
      answer: sanitizedAnswer,
      notionPostIdeaDraft,
      dashboardContextPatch,
      debug: {
        usedMock: this.answerGenerator.name === "mock",
        tableauContextProvider: additionalContext.provider,
        ...(config.tableau.mcp.debugLogResults
          ? {
              mcpExecutionDebug: additionalContext.mcpExecutionDebug,
              mcpObservations: additionalContext.mcpObservations,
              agentExecutionDebug: agentLoopResult.debug,
            }
          : {}),
      },
      createdAt,
    });
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
    const dashboardContextPatch = buildDashboardContextPatch(
      request,
      additionalContext,
    );

    logInfo("chat.service.context_patch.completed", {
      provider: additionalContext.provider,
      patchedFields: dashboardContextPatch?.workbookName
        ? ["workbookName"]
        : [],
      warningCount: additionalContext.warnings?.length ?? 0,
    });

    return {
      dashboardContextPatch,
      debug: {
        tableauContextProvider: additionalContext.provider,
      },
    };
  }

  private async persistAndBuildResponse(input: {
    sessionId: string;
    messageId: string;
    ownerUserId?: string;
    request: ChatRequest;
    answer: string;
    notionPostIdeaDraft?: ChatResponse["notionPostIdeaDraft"];
    dashboardContextPatch?: ChatResponse["dashboardContextPatch"];
    debug?: ChatResponse["debug"];
    createdAt?: string;
  }): Promise<ChatResponse> {
    await this.repository.save({
      sessionId: input.sessionId,
      messageId: input.messageId,
      ownerUserId: input.ownerUserId ?? null,
      question: input.request.question,
      answer: input.answer,
      dashboardName: input.request.dashboardContext.dashboardName,
      workbookName: input.request.dashboardContext.workbookName ?? null,
      worksheetNames: input.request.dashboardContext.worksheets.map(
        (worksheet) => worksheet.name,
      ),
      createdAt: input.createdAt ?? new Date().toISOString(),
      source: input.request.clientContext?.source,
    });

    return {
      answer: input.answer,
      sessionId: input.sessionId,
      messageId: input.messageId,
      notionPostIdeaDraft: input.notionPostIdeaDraft,
      dashboardContextPatch: input.dashboardContextPatch,
      debug: input.debug,
    };
  }
}

function buildNotionDraft(
  question: string,
  answer: string,
  request: ChatRequest,
  additionalContext: Awaited<
    ReturnType<TableauContextProvider["getAdditionalContext"]>
  >,
): ChatResponse["notionPostIdeaDraft"] | undefined {
  const shouldBuildDraft = /(notion|保存|記録|登録|メモ|残して|残す)/i.test(
    question,
  );
  if (!shouldBuildDraft) {
    return undefined;
  }

  const draftKind = detectNotionDraftKind(question);
  const compactAnswer = answer.replace(/\s+/g, " ").trim();

  if (draftKind === "post_idea") {
    const reason =
      compactAnswer.slice(0, 260) || "Tableau MCP analysis based suggestion.";
    const titleSeed = question.replace(/[「」"']/g, "").trim();
    const title =
      titleSeed.length > 80
        ? `${titleSeed.slice(0, 80)}...`
        : titleSeed || "Tableau MCP 分析メモ";

    return {
      draftKind,
      title,
      reason,
      suggestedPostText: compactAnswer.slice(0, 1000),
      summary: compactAnswer.slice(0, 220),
      source: "Tableau MCP",
      tags: ["Tableau", "MCP", "X Analytics"],
    };
  }

  const datasourceName =
    additionalContext.normalizedContext?.datasources?.[0]?.name ??
    request.dashboardContext.dataSources?.[0]?.name;
  const periodLabel = additionalContext.questionInterpretation?.period?.label;
  const title = buildAnalysisMemoTitle({
    question,
    answer,
    periodLabel,
    datasourceName,
    dashboardName: request.dashboardContext.dashboardName,
  });
  const summary = buildAnalysisMemoSummary(answer, datasourceName);

  return {
    draftKind,
    title,
    reason: datasourceName
      ? `データソース「${datasourceName}」をもとに集計した分析結果を記録します。`
      : "Tableau MCP で取得した分析結果を記録します。",
    suggestedPostText: summary,
    summary,
    analysisBody: answer,
    datasourceName,
    periodLabel,
    rankingItems: extractRankingItems(answer),
    source: "Tableau MCP",
    tags: ["Tableau", "MCP", "Analysis Memo"],
  };
}

function detectNotionDraftKind(
  question: string,
): "analysis_memo" | "post_idea" {
  if (
    /(投稿案|投稿アイデア|ポスト案|推奨投稿文|x投稿|post idea|tweet)/i.test(
      question,
    )
  ) {
    return "post_idea";
  }

  return "analysis_memo";
}

function buildAnalysisMemoTitle(input: {
  question: string;
  answer: string;
  periodLabel?: string;
  datasourceName?: string;
  dashboardName?: string;
}): string {
  const firstSentence = input.answer
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  const normalizedFirstSentence = firstSentence
    ?.replace(/^[-*]\s*/, "")
    .replace(/です。?$/, "")
    .replace(/でした。?$/, "")
    .trim();
  if (
    normalizedFirstSentence &&
    normalizedFirstSentence.length <= 80 &&
    !/(notion|保存|記録|登録)/i.test(normalizedFirstSentence)
  ) {
    return normalizedFirstSentence;
  }

  const strippedQuestion = input.question
    .replace(
      /では、?\s*これらの結果をNotionに(保存|記録|登録)してください。?/gi,
      "",
    )
    .replace(/notionに?(保存|記録|登録)(してください|したい|したいです)?/gi, "")
    .replace(/[「」"']/g, "")
    .trim();
  if (strippedQuestion && strippedQuestion.length <= 80) {
    return strippedQuestion;
  }

  if (input.periodLabel && /favorite/i.test(input.answer)) {
    return `${input.periodLabel} Favorite数ランキング`;
  }
  if (input.periodLabel && /view/i.test(input.answer)) {
    return `${input.periodLabel} View数ランキング`;
  }
  if (input.dashboardName) {
    return `${input.dashboardName} の分析メモ`;
  }

  return "Tableau MCP 分析メモ";
}

function buildAnalysisMemoSummary(
  answer: string,
  datasourceName?: string,
): string {
  const lines = answer
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const rankingLineIndex = lines.findIndex((line) => /^\d+\.\s+/.test(line));
  const summaryLines =
    rankingLineIndex >= 0
      ? lines.slice(0, rankingLineIndex)
      : lines.slice(0, 2);
  const summary = summaryLines.join(" ").replace(/\s+/g, " ").trim();
  if (summary) {
    return summary.length > 240 ? `${summary.slice(0, 240)}…` : summary;
  }

  if (datasourceName) {
    return `データソース「${datasourceName}」の分析結果メモです。`;
  }

  return "Tableau MCP の分析結果メモです。";
}

function extractRankingItems(answer: string): NotionRankingItem[] {
  const items: NotionRankingItem[] = [];
  for (const line of answer.split(/\r?\n/).map((value) => value.trim())) {
    const match = line.match(/^\d+\.\s+(.+?):\s+(.+)$/);
    if (!match) {
      continue;
    }

    items.push({
      label: match[1].trim(),
      value: match[2].trim(),
    });
  }

  return items;
}

function clipForDebugLog(value: string): string {
  const maxChars = Math.max(
    200,
    Number(process.env.CHAT_DEBUG_MAX_CHARS ?? 12000),
  );
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}...`;
}

export function sanitizeUserFacingAnswer(
  answer: string,
  request: ChatRequest,
  additionalContext: Awaited<
    ReturnType<TableauContextProvider["getAdditionalContext"]>
  >,
): string {
  const answerAfterFieldValidation = sanitizeHallucinatedFieldMentions(
    answer,
    request,
    additionalContext,
  );
  const queryExecutionMissing =
    additionalContext.mcpExecutionDebug?.intent === "data_analysis" &&
    !hasSuccessfulDatasourceQuery(additionalContext);
  const looksLikeManualQueryInstruction =
    /```sql|select\s+.+\s+from|datasource query|クエリを実行|query\s+to\s+run|以下のクエリ|execute the query/i.test(
      answerAfterFieldValidation,
    );
  if (queryExecutionMissing && looksLikeManualQueryInstruction) {
    const datasourceNames =
      additionalContext.normalizedContext?.datasources
        ?.map((datasource) => datasource.name)
        .filter(Boolean) ??
      request.dashboardContext.dataSources
        ?.map((datasource) => datasource.name)
        .filter(Boolean) ??
      [];
    const datasourceText = datasourceNames.length
      ? datasourceNames.join("、")
      : "対象データソース";
    return [
      `このダッシュボードで確認できているデータソースは ${datasourceText} です。`,
      "ただし、今回の処理では安全制約により集計クエリを実行できなかったため、最終的なランキング結果までは確定できませんでした。",
      "次は、開発者向けの確認として安全制約で除外されたフィールド判定（機微情報判定）が厳しすぎないかを確認するのがよいです。",
    ].join("");
  }

  const containsInternalToolInstruction =
    /(get-datasource-metadata|query-datasource|datasource-id|datasource id)/i.test(
      answerAfterFieldValidation,
    );
  if (!containsInternalToolInstruction) {
    return answerAfterFieldValidation;
  }

  const isMetadataLookup =
    additionalContext.mcpExecutionDebug?.intent === "metadata_lookup";
  const metadataResolved = hasResolvedMetadata(additionalContext);
  if (!isMetadataLookup || metadataResolved) {
    return answerAfterFieldValidation
      .replace(/get-datasource-metadata/gi, "datasource metadata lookup")
      .replace(/query-datasource/gi, "datasource query")
      .replace(/datasource-id/gi, "datasource identifier");
  }

  const datasourceNames =
    additionalContext.normalizedContext?.datasources
      ?.map((datasource) => datasource.name)
      .filter(Boolean) ??
    request.dashboardContext.dataSources
      ?.map((datasource) => datasource.name)
      .filter(Boolean) ??
    [];
  const datasourceText = datasourceNames.length
    ? datasourceNames.join("、")
    : "対象データソース";

  return [
    `このダッシュボードで確認できているデータソースは ${datasourceText} です。`,
    "ただし、フィールド一覧を取得するために必要な Tableau Cloud 上の datasource id / luid / contentUrl をアプリ側で特定できなかったため、現時点ではフィールド一覧までは説明できません。",
    "次は、開発者向けの確認として list-datasources または search-content の結果に datasource identifier が含まれているかを確認するのがよいです。",
  ].join("");
}

export function finalizeUserFacingAnswer(
  answer: string,
  request: ChatRequest,
  additionalContext: Awaited<
    ReturnType<TableauContextProvider["getAdditionalContext"]>
  >,
): string {
  const datasourceInventoryAnswer = buildDatasourceInventoryAnswerFromContext(
    request,
    additionalContext,
  );
  if (datasourceInventoryAnswer) {
    return datasourceInventoryAnswer;
  }

  const fieldInventoryAnswer = buildFieldInventoryAnswerFromContext(
    request,
    additionalContext,
  );
  if (fieldInventoryAnswer) {
    return fieldInventoryAnswer;
  }

  const mcpFailureAnswer = buildMcpConnectionFailureAnswer(
    request,
    additionalContext,
  );
  if (mcpFailureAnswer) {
    return mcpFailureAnswer;
  }

  const structuredAnswer = buildStructuredDataAnalysisAnswer(
    request,
    additionalContext,
  );
  if (structuredAnswer) {
    return structuredAnswer;
  }

  const noValidatedRankingFallback = buildNoValidatedRankingFallback(
    request,
    additionalContext,
  );
  if (noValidatedRankingFallback) {
    return noValidatedRankingFallback;
  }

  const safeDataAnalysisFallback = buildSafeDataAnalysisFallback(
    request,
    additionalContext,
  );
  if (safeDataAnalysisFallback) {
    return safeDataAnalysisFallback;
  }

  return sanitizeUserFacingAnswer(answer, request, additionalContext);
}

function sanitizeHallucinatedFieldMentions(
  answer: string,
  request: ChatRequest,
  additionalContext: Awaited<
    ReturnType<TableauContextProvider["getAdditionalContext"]>
  >,
): string {
  if (additionalContext.provider !== "tableau-mcp") {
    return answer;
  }

  if (additionalContext.mcpExecutionDebug?.intent !== "metadata_lookup") {
    return answer;
  }

  const fieldProfiles = additionalContext.datasourceFieldProfiles ?? [];
  if (!fieldProfiles.length) {
    return answer;
  }

  const knownFieldNameSet = new Set(
    fieldProfiles
      .flatMap((profile) => profile.fieldNames)
      .map((fieldName) => normalizeFieldToken(fieldName))
      .filter(Boolean),
  );
  if (!knownFieldNameSet.size) {
    return answer;
  }

  const mentionedFieldCandidates = extractMentionedFieldCandidates(answer);
  const unknownMentionedFields = mentionedFieldCandidates.filter(
    (field) => !knownFieldNameSet.has(normalizeFieldToken(field)),
  );
  if (!unknownMentionedFields.length) {
    return answer;
  }

  const datasourceNames =
    additionalContext.normalizedContext?.datasources
      ?.map((datasource) => datasource.name)
      .filter(Boolean) ??
    request.dashboardContext.dataSources
      ?.map((datasource) => datasource.name)
      .filter(Boolean) ??
    [];

  return buildStrictFieldAnswerFromProfiles(fieldProfiles, datasourceNames);
}

function extractMentionedFieldCandidates(answer: string): string[] {
  const candidates = new Set<string>();

  for (const match of answer.matchAll(/`([^`\n]{2,120})`/g)) {
    const value = match[1]?.trim();
    if (looksLikeFieldToken(value)) {
      candidates.add(value);
    }
  }

  for (const line of answer.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) {
      continue;
    }
    const firstCell = trimmed.split("|")[1]?.trim();
    if (!firstCell || /^-+$/.test(firstCell)) {
      continue;
    }
    if (looksLikeFieldToken(firstCell)) {
      candidates.add(firstCell);
    }
  }

  return [...candidates];
}

function looksLikeFieldToken(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed || /^[\d\-_.]+$/.test(trimmed)) {
    return false;
  }

  return /[A-Za-z_]/.test(trimmed) && !/\s{2,}/.test(trimmed);
}

function normalizeFieldToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function buildStrictFieldAnswerFromProfiles(
  profiles: DatasourceFieldProfile[],
  datasourceNames: string[],
): string {
  const lines: string[] = [];
  const uniqueDatasourceNames = [...new Set(datasourceNames)];
  const headerDatasource = uniqueDatasourceNames.length
    ? uniqueDatasourceNames.join("、")
    : profiles.map((profile) => profile.datasourceName).join("、");
  lines.push(
    `このダッシュボードで確認できているデータソースは ${headerDatasource} です。`,
  );
  lines.push(
    "取得できたTableau Cloudのメタデータに基づくフィールド一覧は次のとおりです。",
  );

  for (const profile of profiles) {
    lines.push(`- ${profile.datasourceName}（${profile.fieldCount}件）`);
    lines.push(`  ${profile.fieldNames.join("、")}`);
  }

  lines.push(
    "上記以外のフィールド名は、今回取得できたメタデータでは確認できませんでした。",
  );
  return lines.join("\n");
}
function hasResolvedMetadata(
  additionalContext: Awaited<
    ReturnType<TableauContextProvider["getAdditionalContext"]>
  >,
): boolean {
  if (additionalContext.provider === "tableau-mcp") {
    const metadata = additionalContext.metadata as
      | Record<string, unknown>
      | undefined;
    if (typeof metadata?.hasMetadata === "boolean") {
      return metadata.hasMetadata;
    }

    return (
      additionalContext.mcpToolResults?.some(
        (result) =>
          result.toolName === "get-datasource-metadata" &&
          result.status === "success",
      ) ?? false
    );
  }

  return Boolean(additionalContext.metadata);
}

function hasSuccessfulDatasourceQuery(
  additionalContext: Awaited<
    ReturnType<TableauContextProvider["getAdditionalContext"]>
  >,
): boolean {
  return (
    additionalContext.mcpToolResults?.some(
      (result) =>
        result.toolName === "query-datasource" && result.status === "success",
    ) ?? false
  );
}

export function buildStructuredDataAnalysisAnswer(
  request: ChatRequest,
  additionalContext: Awaited<
    ReturnType<TableauContextProvider["getAdditionalContext"]>
  >,
): string | undefined {
  if (additionalContext.mcpExecutionDebug?.intent !== "data_analysis") {
    return undefined;
  }

  const interpretation = additionalContext.questionInterpretation;
  const insight = selectBestQueryInsight(
    additionalContext.queryInsights ?? [],
    interpretation,
    request.question,
  );
  if (!insight) {
    return undefined;
  }

  const rows = insight.rows.filter((row) => row.label || row.value !== null);
  if (!rows.length) {
    return undefined;
  }

  const periodLabel = interpretation?.period?.label;
  const metricLabel =
    interpretation && interpretation.metricIntent !== "unknown"
      ? metricIntentLabel(interpretation.metricIntent)
      : describeMetricField(insight.metricField);
  const isRankingQuestion = isRankingLikeRequest(
    interpretation,
    request.question,
  );
  const requestedTopN = interpretation?.topN ?? 10;
  const visibleRows = rows.slice(
    0,
    isRankingQuestion
      ? Math.min(requestedTopN, rows.length)
      : Math.min(3, rows.length),
  );
  const intro = isRankingQuestion
    ? `${periodLabel ? `${periodLabel}の` : ""}${metricLabel}ランキングです。`
    : `${periodLabel ? `${periodLabel}の` : ""}${metricLabel}が高いVizです。`;
  const body = isRankingQuestion
    ? visibleRows
        .map(
          (row, index) =>
            `${index + 1}. ${row.label ?? "名称不明"}: ${formatMetricValue(row.value)}`,
        )
        .join("\n")
    : visibleRows
        .map(
          (row) =>
            `- ${row.label ?? "名称不明"}: ${formatMetricValue(row.value)}`,
        )
        .join("\n");

  return [
    `${intro}`,
    `このダッシュボードの現在のフィルター範囲で参照されているデータソース「${insight.datasourceName}」から集計しています。`,
    ...(isRankingQuestion && rows.length < requestedTopN
      ? [`取得できたランキング件数は ${rows.length} 件です。`]
      : []),
    "",
    body,
  ].join("\n");
}

function buildSafeDataAnalysisFallback(
  request: ChatRequest,
  additionalContext: Awaited<
    ReturnType<TableauContextProvider["getAdditionalContext"]>
  >,
): string | undefined {
  if (
    additionalContext.mcpExecutionDebug?.intent !== "data_analysis" ||
    !hasSuccessfulDatasourceQuery(additionalContext) ||
    Boolean(
      selectBestQueryInsight(
        additionalContext.queryInsights ?? [],
        additionalContext.questionInterpretation,
        request.question,
      ),
    )
  ) {
    return undefined;
  }

  const interpretation = additionalContext.questionInterpretation;
  const periodLabel = interpretation?.period?.label;
  const metricLabel =
    interpretation && interpretation.metricIntent !== "unknown"
      ? metricIntentLabel(interpretation.metricIntent)
      : "集計値";
  const datasourceNames =
    additionalContext.normalizedContext?.datasources
      ?.map((datasource) => datasource.name)
      .filter(Boolean) ??
    request.dashboardContext.dataSources
      ?.map((datasource) => datasource.name)
      .filter(Boolean) ??
    [];
  const datasourceText = datasourceNames.length
    ? datasourceNames.join("、")
    : "対象データソース";

  return [
    `${
      periodLabel ? `${periodLabel}の` : ""
    }${metricLabel}を安全に確定できませんでした。`,
    `このダッシュボードの現在のフィルター範囲でのデータソース「${datasourceText}」に対する集計クエリ自体は実行しましたが、返却結果が要求した期間や指標と一致していることを確認できなかったため、誤ったランキングは返さないようにしています。`,
    "これはデータソース全体にデータがないことを意味しません。次は、要求した指標名に対応するフィールドの有無と、query-datasource の返却列名を確認するのがよいです。",
  ].join("\n");
}

function buildNoValidatedRankingFallback(
  request: ChatRequest,
  additionalContext: Awaited<
    ReturnType<TableauContextProvider["getAdditionalContext"]>
  >,
): string | undefined {
  if (additionalContext.mcpExecutionDebug?.intent !== "data_analysis") {
    return undefined;
  }

  const interpretation = additionalContext.questionInterpretation;
  const rankingRequested = isRankingLikeRequest(
    interpretation,
    request.question,
  );
  if (!rankingRequested) {
    return undefined;
  }

  const hasValidatedInsight = Boolean(
    selectBestQueryInsight(
      additionalContext.queryInsights ?? [],
      interpretation,
      request.question,
    ),
  );
  if (hasValidatedInsight) {
    return undefined;
  }

  const queryExecuted = hasSuccessfulDatasourceQuery(additionalContext);
  const datasourceNames =
    additionalContext.normalizedContext?.datasources
      ?.map((datasource) => datasource.name)
      .filter(Boolean) ??
    request.dashboardContext.dataSources
      ?.map((datasource) => datasource.name)
      .filter(Boolean) ??
    [];
  const datasourceText = datasourceNames.length
    ? datasourceNames.join("、")
    : "対象データソース";
  const periodLabel = interpretation?.period?.label;
  const metricLabel =
    interpretation && interpretation.metricIntent !== "unknown"
      ? metricIntentLabel(interpretation.metricIntent)
      : "指標";

  return queryExecuted
    ? [
        `${periodLabel ? `${periodLabel}の` : ""}${metricLabel}ランキングを安全に確定できませんでした。`,
        `このダッシュボードの現在のフィルター範囲でのデータソース「${datasourceText}」への集計クエリは実行しましたが、返却結果が要求した指標・件数と一致していることを確認できませんでした。`,
        "誤ったランキングを返さないため、結果の提示は保留しています。これはデータソース全体が空という意味ではありません。次は query-datasource の返却行数と列名を確認するのがよいです。",
      ].join("\n")
    : [
        `${periodLabel ? `${periodLabel}の` : ""}${metricLabel}ランキングをまだ確定できませんでした。`,
        `このダッシュボードの現在のフィルター範囲でのデータソース「${datasourceText}」に対して、要求した指標に一致する集計クエリまで到達できていません。`,
        "誤ったランキング表を返さないため、結果の提示は保留しています。これはデータソース全体が空という意味ではありません。次は要求した指標に対応する集計フィールドを確認するのがよいです。",
      ].join("\n");
}

function buildMcpConnectionFailureAnswer(
  request: ChatRequest,
  additionalContext: Awaited<
    ReturnType<TableauContextProvider["getAdditionalContext"]>
  >,
): string | undefined {
  if (
    additionalContext.provider !== "tableau-mcp" ||
    !additionalContext.mcpConnectionFailed ||
    additionalContext.mcpExecutionDebug?.intent !== "data_analysis"
  ) {
    return undefined;
  }

  const interpretation = additionalContext.questionInterpretation;
  const periodLabel = interpretation?.period?.label;
  const metricLabel =
    interpretation && interpretation.metricIntent !== "unknown"
      ? metricIntentLabel(interpretation.metricIntent)
      : "集計値";
  const datasourceNames =
    additionalContext.normalizedContext?.datasources
      ?.map((datasource) => datasource.name)
      .filter(Boolean) ??
    request.dashboardContext.dataSources
      ?.map((datasource) => datasource.name)
      .filter(Boolean) ??
    [];
  const datasourceText = datasourceNames.length
    ? datasourceNames.join("、")
    : "対象データソース";

  return [
    `Tableau MCP への接続に失敗したため、${periodLabel ? `${periodLabel}の` : ""}${metricLabel}について実データに基づく分析結果を確定できませんでした。`,
    `現在のダッシュボードのフィルター範囲で対象だったデータソースは「${datasourceText}」ですが、MCP が起動段階で失敗しており、ランキングや合計値を裏付ける観測値は取得できていません。`,
    "これはデータソース全体にデータがないことを意味しません。接続が回復したら再実行すると、実データに基づく分析ができます。",
  ].join("\n");
}

function buildDatasourceInventoryFastPathAnswer(
  request: ChatRequest,
  interpretation: QuestionInterpretation,
): string | undefined {
  if (!isStrongDatasourceInventoryRequest(interpretation)) {
    return undefined;
  }

  const datasourceNames =
    request.dashboardContext.dataSources
      ?.map((datasource) => datasource.name?.trim())
      .filter((name): name is string => Boolean(name)) ?? [];
  if (!datasourceNames.length) {
    return undefined;
  }

  const uniqueDatasourceNames = [...new Set(datasourceNames)];
  const lines = [
    `このダッシュボードで使用されているデータソースは ${uniqueDatasourceNames.join("、")} です。`,
  ];
  if (request.dashboardContext.workbookName) {
    lines.push(
      `ワークブック「${request.dashboardContext.workbookName}」の現在のダッシュボード文脈から確認しています。`,
    );
  }
  lines.push(
    "より詳しいフィールド構成が必要な場合は、このデータソースのフィールド一覧まで確認できます。",
  );
  return lines.join("\n");
}

function buildDeadlineAwareDeterministicAnswer(
  request: ChatRequest,
  additionalContext: Awaited<
    ReturnType<TableauContextProvider["getAdditionalContext"]>
  >,
): string {
  const datasourceInventoryAnswer = buildDatasourceInventoryAnswerFromContext(
    request,
    additionalContext,
  );
  if (datasourceInventoryAnswer) {
    return datasourceInventoryAnswer;
  }

  const fieldInventoryAnswer = buildFieldInventoryAnswerFromContext(
    request,
    additionalContext,
  );
  if (fieldInventoryAnswer) {
    return fieldInventoryAnswer;
  }

  const structuredAnswer = buildStructuredDataAnalysisAnswer(
    request,
    additionalContext,
  );
  if (structuredAnswer) {
    return structuredAnswer;
  }

  const workbookName =
    request.dashboardContext.workbookName ??
    additionalContext.normalizedContext?.workbook?.name;
  const datasourceNames =
    additionalContext.normalizedContext?.datasources
      ?.map((datasource) => datasource.name)
      .filter(Boolean) ??
    request.dashboardContext.dataSources
      ?.map((datasource) => datasource.name)
      .filter(Boolean) ??
    [];
  const warningLine = additionalContext.warnings?.length
    ? `補足: ${additionalContext.warnings.join(" ")}`
    : undefined;

  return [
    `このダッシュボード「${request.dashboardContext.dashboardName}」の確認結果です。`,
    workbookName ? `ワークブック: ${workbookName}` : undefined,
    datasourceNames.length
      ? `データソース: ${[...new Set(datasourceNames)].join("、")}`
      : undefined,
    warningLine,
    "詳細な自然文の整形は省略しましたが、取得できたTableau情報をもとに回答しています。",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildDatasourceInventoryAnswerFromContext(
  request: ChatRequest,
  additionalContext: Awaited<
    ReturnType<TableauContextProvider["getAdditionalContext"]>
  >,
): string | undefined {
  const interpretation = additionalContext.questionInterpretation;
  if (!interpretation || !isStrongDatasourceInventoryRequest(interpretation)) {
    return undefined;
  }

  const datasourceNames =
    additionalContext.normalizedContext?.datasources
      ?.map((datasource) => datasource.name)
      .filter(Boolean) ??
    request.dashboardContext.dataSources
      ?.map((datasource) => datasource.name)
      .filter(Boolean) ??
    [];
  if (!datasourceNames.length) {
    return undefined;
  }

  return [
    `このダッシュボードで使用されているデータソースは ${[...new Set(datasourceNames)].join("、")} です。`,
    additionalContext.normalizedContext?.workbook?.name
      ? `取得できた Tableau Cloud 情報では、ワークブック「${additionalContext.normalizedContext.workbook.name}」に関連付けられています。`
      : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildFieldInventoryAnswerFromContext(
  request: ChatRequest,
  additionalContext: Awaited<
    ReturnType<TableauContextProvider["getAdditionalContext"]>
  >,
): string | undefined {
  const interpretation = additionalContext.questionInterpretation;
  if (!interpretation || !isStrongFieldInventoryRequest(interpretation)) {
    return undefined;
  }

  const fieldProfiles = additionalContext.datasourceFieldProfiles ?? [];
  if (!fieldProfiles.length) {
    return undefined;
  }

  const preferredDatasourceName = interpretation.datasourceName?.trim();
  const selectedProfiles = preferredDatasourceName
    ? fieldProfiles.filter(
        (profile) =>
          profile.datasourceName.trim().toLowerCase() ===
          preferredDatasourceName.toLowerCase(),
      )
    : fieldProfiles;
  const profilesToRender = selectedProfiles.length
    ? selectedProfiles
    : fieldProfiles;
  if (!profilesToRender.length) {
    return undefined;
  }

  const datasourceNames = [
    ...new Set(profilesToRender.map((p) => p.datasourceName)),
  ];
  const lines = [
    `データソース ${datasourceNames.join("、")} で確認できたフィールド一覧です。`,
  ];
  if (additionalContext.normalizedContext?.workbook?.name) {
    lines.push(
      `取得できた Tableau Cloud 情報では、ワークブック「${additionalContext.normalizedContext.workbook.name}」に関連付けられています。`,
    );
  }

  for (const profile of profilesToRender) {
    lines.push(`- ${profile.datasourceName}（${profile.fieldCount}件）`);
    const details: Array<{
      name: string;
      dataType?: string;
      role?: string;
      semanticRole?: string;
    }> = profile.fields.length
      ? profile.fields
      : profile.fieldNames.map((fieldName) => ({
          name: fieldName,
          dataType: undefined,
          role: undefined,
          semanticRole: undefined,
        }));
    lines.push(
      ...details.slice(0, 20).map((fieldDetail) => {
        const annotations = [
          fieldDetail.dataType,
          fieldDetail.role,
          fieldDetail.semanticRole,
        ].filter(Boolean);
        return annotations.length
          ? `  - ${fieldDetail.name} [${annotations.join(" / ")}]`
          : `  - ${fieldDetail.name}`;
      }),
    );
    if (details.length > 20) {
      lines.push(`  - ...ほか ${details.length - 20} 件`);
    }
  }

  lines.push(
    "必要であれば、この中の特定フィールドが何を表すかも続けて説明できます。",
  );

  return lines.join("\n");
}

function describeMetricField(fieldName: string): string {
  const normalized = fieldName.toLowerCase();
  if (/favorite|favourite/.test(normalized)) {
    return "Favorite数";
  }
  if (/view/.test(normalized)) {
    return "View数";
  }
  if (/love/.test(normalized)) {
    return "Love数";
  }
  if (/bookmark/.test(normalized)) {
    return "Bookmark数";
  }
  return fieldName;
}

function formatMetricValue(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "値なし";
  }

  return new Intl.NumberFormat("ja-JP").format(value);
}

function selectBestQueryInsight(
  insights: QueryDatasourceInsight[],
  interpretation: QuestionInterpretation | undefined,
  question: string,
): QueryDatasourceInsight | undefined {
  if (
    interpretation?.requestType === "field_inventory" ||
    interpretation?.requestType === "datasource_inventory"
  ) {
    logDebug("chat.query_insight.selected", {
      requestType: interpretation.requestType,
      selectedMetricField: undefined,
      selectedDatasourceName: undefined,
      selectedRowCount: 0,
      selectedScore: undefined,
      selectedReasons: ["request_type_blocks_query_insights"],
      candidateCount: insights.length,
    });
    return undefined;
  }

  const candidates = insights
    .map((insight, index) => ({
      insight,
      evaluation: evaluateQueryInsight(
        insight,
        interpretation,
        question,
        index,
      ),
      index,
    }))
    .filter((candidate) => candidate.insight.rows.length > 0)
    .sort((left, right) => {
      if (right.evaluation.score !== left.evaluation.score) {
        return right.evaluation.score - left.evaluation.score;
      }
      return right.index - left.index;
    });

  const selected =
    candidates[0] && candidates[0].evaluation.score > 0
      ? candidates[0]
      : undefined;
  logDebug("chat.query_insight.selected", {
    selectedMetricField: selected?.insight.metricField,
    selectedDatasourceName: selected?.insight.datasourceName,
    selectedRowCount: selected?.insight.rows.length,
    selectedScore: selected?.evaluation.score,
    selectedReasons: selected?.evaluation.reasons,
    candidateCount: candidates.length,
  });
  if (candidates.length) {
    logDebug("chat.query_insight.rejected", {
      rejected: candidates
        .filter((candidate) => candidate !== selected)
        .slice(0, 5)
        .map((candidate) => ({
          metricField: candidate.insight.metricField,
          datasourceName: candidate.insight.datasourceName,
          rowCount: candidate.insight.rows.length,
          score: candidate.evaluation.score,
          reasons: candidate.evaluation.reasons,
        })),
    });
  }

  return selected?.insight;
}

function evaluateQueryInsight(
  insight: QueryDatasourceInsight,
  interpretation: QuestionInterpretation | undefined,
  question: string,
  index: number,
): { score: number; reasons: string[] } {
  let score = index;
  const reasons: string[] = ["later_pass_preference"];

  if (insight.rows.length > 0) {
    score += 10;
    reasons.push("has_rows");
  }

  const rankingRequested = isRankingLikeRequest(interpretation, question);
  if (rankingRequested) {
    score += 20;
    reasons.push("ranking_requested");
    if (insight.rows.length > 1) {
      score += 30;
      reasons.push("multiple_rows");
    }
    if ((insight.requestedTopN ?? 0) > 1 || (interpretation?.topN ?? 1) > 1) {
      score += 25;
      reasons.push("topn_requested");
    }
    score += Math.min(insight.rows.length, interpretation?.topN ?? 10);
    if (insight.fulfillsRankingRequest === false) {
      score -= 90;
      reasons.push("ranking_request_not_fulfilled");
    }
  }

  if (
    interpretation?.metricIntent &&
    interpretation.metricIntent !== "unknown"
  ) {
    if (insight.requestedMetricIntent === interpretation.metricIntent) {
      score += 120;
      reasons.push("requested_metric_exact_match");
    } else if (
      matchesMetricFieldIntent(insight.metricField, interpretation.metricIntent)
    ) {
      score += 80;
      reasons.push("metric_field_name_match");
    } else {
      score -= 260;
      reasons.push("metric_mismatch");
    }
  }

  if (
    interpretation?.period &&
    insight.requestedPeriodStart === interpretation.period.startDate &&
    insight.requestedPeriodEnd === interpretation.period.endDate
  ) {
    score += 40;
    reasons.push("period_exact_match");
  } else if (interpretation?.period) {
    score -= 60;
    reasons.push("period_mismatch");
  }

  if (insight.fulfillsMetricRequest === false) {
    score -= 200;
    reasons.push("fulfills_metric_false");
  }

  if (
    rankingRequested &&
    interpretation?.topN &&
    interpretation.topN > 1 &&
    insight.rows.length < Math.min(interpretation.topN, 10)
  ) {
    score -= 50;
    reasons.push("insufficient_rows_for_requested_topn");
  }

  return { score, reasons };
}

function isRankingLikeRequest(
  interpretation: QuestionInterpretation | undefined,
  question: string,
): boolean {
  return Boolean(
    interpretation?.asksForRanking ||
    (interpretation?.topN ?? 1) > 1 ||
    detectRankingIntent(question),
  );
}

function isStrongDatasourceInventoryRequest(
  interpretation: QuestionInterpretation,
): boolean {
  return (
    interpretation.requestType === "datasource_inventory" &&
    (interpretation.requestTypeConfidence ?? 0) >= 0.9 &&
    interpretation.metricIntent === "unknown" &&
    !interpretation.asksForRanking &&
    interpretation.topN <= 1 &&
    !interpretation.period &&
    !interpretation.requestTypeSignals?.includes("analysis_like_signal")
  );
}

function isStrongFieldInventoryRequest(
  interpretation: QuestionInterpretation,
): boolean {
  return (
    interpretation.requestType === "field_inventory" &&
    (interpretation.requestTypeConfidence ?? 0) >= 0.9 &&
    interpretation.metricIntent === "unknown" &&
    !interpretation.asksForRanking &&
    interpretation.topN <= 1 &&
    !interpretation.period &&
    !interpretation.requestTypeSignals?.includes("analysis_like_signal")
  );
}

function buildDashboardContextPatch(
  request: { dashboardContext: DashboardContext },
  additionalContext: Awaited<
    ReturnType<TableauContextProvider["getAdditionalContext"]>
  >,
): ChatResponse["dashboardContextPatch"] {
  if (request.dashboardContext.workbookName) {
    return undefined;
  }

  const workbookName =
    extractName(additionalContext.workbook) ??
    extractWorkbookNameFromMetadata(additionalContext.metadata);
  if (
    !workbookName ||
    isLikelyDashboardOrWorksheetName(workbookName, request.dashboardContext)
  ) {
    return undefined;
  }

  return { workbookName };
}

function isLikelyDashboardOrWorksheetName(
  workbookName: string,
  dashboardContext: DashboardContext,
): boolean {
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

    const workbookName = extractName(
      (dashboard as Record<string, unknown>).workbook,
    );
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
  return [
    ...direct,
    ...Object.values(record).flatMap((item) => findArraysByKey(item, key)),
  ];
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
  const chatAgent = createChatAgent(config.model.provider);

  return new ChatService(
    provider,
    answerGenerator,
    createChatHistoryRepository(),
    chatAgent,
  );
}

function createAnswerGenerator(
  providerName: ReturnType<typeof getConfig>["model"]["provider"],
): AnswerGenerator {
  switch (providerName) {
    case "bedrock":
      return new BedrockAnswerGenerator();
    case "mock":
    default:
      return new MockAnswerGenerator();
  }
}

function createChatAgent(
  providerName: ReturnType<typeof getConfig>["model"]["provider"],
): ChatAgent {
  switch (providerName) {
    case "bedrock":
      return new BedrockChatAgent();
    case "mock":
    default:
      return new NoopChatAgent();
  }
}

function createContextProvider(
  providerName: ReturnType<typeof getConfig>["tableau"]["contextProvider"],
): TableauContextProvider {
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

function resolveTableauSubject(
  authenticatedUser: AuthenticatedUser | undefined,
): string | undefined {
  const config = getConfig();
  return (
    authenticatedUser?.tableauSubject ??
    (config.tableau.defaultSubject || undefined)
  );
}
