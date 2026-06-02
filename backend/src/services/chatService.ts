import { randomUUID } from "node:crypto";
import { getConfig } from "../config";
import { logDebug, logInfo, safeHash } from "../logging";
import { createChatHistoryRepository, type ChatHistoryRepository } from "../repositories/chatHistoryRepository";
import { DirectTableauApiContextProvider } from "../tableau/directTableauApiContextProvider";
import { MockTableauContextProvider } from "../tableau/mockTableauContextProvider";
import { TableauMcpContextProvider } from "../tableau/tableauMcpContextProvider";
import type { TableauContextProvider } from "../tableau/contextProvider";
import type { AuthenticatedUser } from "../types/auth";
import type { ChatRequest, ChatResponse, ContextRequest, ContextResponse } from "../types/chat";
import type { DashboardContext, DatasourceFieldProfile } from "../types/tableau";
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
    logDebug("chat.message.input_debug", {
      sessionId,
      messageId,
      questionLength: request.question.length,
      question: clipForDebugLog(request.question),
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
    const sanitizedAnswer = finalizeUserFacingAnswer(answer, request, additionalContext);
    logDebug("chat.message.output_debug", {
      sessionId,
      messageId,
      answerLength: sanitizedAnswer.length,
      answer: clipForDebugLog(sanitizedAnswer),
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
      answer: sanitizedAnswer,
      dashboardName: request.dashboardContext.dashboardName,
      workbookName: request.dashboardContext.workbookName ?? null,
      worksheetNames: request.dashboardContext.worksheets.map((worksheet) => worksheet.name),
      createdAt,
      source: request.clientContext?.source,
    });

    return {
      answer: sanitizedAnswer,
      sessionId,
      messageId,
      notionPostIdeaDraft: buildNotionPostIdeaDraft(request.question, sanitizedAnswer),
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

function buildNotionPostIdeaDraft(question: string, answer: string): ChatResponse["notionPostIdeaDraft"] | undefined {
  const shouldBuildDraft = /(notion|保存|投稿|ポスト|idea|アイデア)/i.test(question);
  if (!shouldBuildDraft) {
    return undefined;
  }

  const shortAnswer = answer.replace(/\s+/g, " ").trim();
  const reason = shortAnswer.slice(0, 260) || "Tableau MCP analysis based suggestion.";
  const titleSeed = question.replace(/[「」"']/g, "").trim();
  const title = titleSeed.length > 80 ? `${titleSeed.slice(0, 80)}...` : titleSeed || "Tableau MCP 分析メモ";

  return {
    title,
    reason,
    suggestedPostText: shortAnswer.slice(0, 1000),
    source: "Tableau MCP",
    tags: ["Tableau", "MCP", "X Analytics"],
  };
}

function clipForDebugLog(value: string): string {
  const maxChars = Math.max(200, Number(process.env.CHAT_DEBUG_MAX_CHARS ?? 12000));
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}...`;
}

export function sanitizeUserFacingAnswer(
  answer: string,
  request: ChatRequest,
  additionalContext: Awaited<ReturnType<TableauContextProvider["getAdditionalContext"]>>,
): string {
  const answerAfterFieldValidation = sanitizeHallucinatedFieldMentions(answer, request, additionalContext);
  const queryExecutionMissing =
    additionalContext.mcpExecutionDebug?.intent === "data_analysis" && !hasSuccessfulDatasourceQuery(additionalContext);
  const looksLikeManualQueryInstruction =
    /```sql|select\s+.+\s+from|datasource query|クエリを実行|query\s+to\s+run|以下のクエリ|execute the query/i.test(
      answerAfterFieldValidation,
    );
  if (queryExecutionMissing && looksLikeManualQueryInstruction) {
    const datasourceNames =
      additionalContext.normalizedContext?.datasources?.map((datasource) => datasource.name).filter(Boolean) ??
      request.dashboardContext.dataSources?.map((datasource) => datasource.name).filter(Boolean) ??
      [];
    const datasourceText = datasourceNames.length ? datasourceNames.join("、") : "対象データソース";
    return [
      `このダッシュボードで確認できているデータソースは ${datasourceText} です。`,
      "ただし、今回の処理では安全制約により集計クエリを実行できなかったため、最終的なランキング結果までは確定できませんでした。",
      "次は、開発者向けの確認として安全制約で除外されたフィールド判定（機微情報判定）が厳しすぎないかを確認するのがよいです。",
    ].join("");
  }

  const containsInternalToolInstruction = /(get-datasource-metadata|query-datasource|datasource-id|datasource id)/i.test(
    answerAfterFieldValidation,
  );
  if (!containsInternalToolInstruction) {
    return answerAfterFieldValidation;
  }

  const isMetadataLookup = additionalContext.mcpExecutionDebug?.intent === "metadata_lookup";
  const metadataResolved = hasResolvedMetadata(additionalContext);
  if (!isMetadataLookup || metadataResolved) {
    return answerAfterFieldValidation
      .replace(/get-datasource-metadata/gi, "datasource metadata lookup")
      .replace(/query-datasource/gi, "datasource query")
      .replace(/datasource-id/gi, "datasource identifier");
  }

  const datasourceNames =
    additionalContext.normalizedContext?.datasources?.map((datasource) => datasource.name).filter(Boolean) ??
    request.dashboardContext.dataSources?.map((datasource) => datasource.name).filter(Boolean) ??
    [];
  const datasourceText = datasourceNames.length ? datasourceNames.join("、") : "対象データソース";

  return [
    `このダッシュボードで確認できているデータソースは ${datasourceText} です。`,
    "ただし、フィールド一覧を取得するために必要な Tableau Cloud 上の datasource id / luid / contentUrl をアプリ側で特定できなかったため、現時点ではフィールド一覧までは説明できません。",
    "次は、開発者向けの確認として list-datasources または search-content の結果に datasource identifier が含まれているかを確認するのがよいです。",
  ].join("");
}

export function finalizeUserFacingAnswer(
  answer: string,
  request: ChatRequest,
  additionalContext: Awaited<ReturnType<TableauContextProvider["getAdditionalContext"]>>,
): string {
  const structuredAnswer = buildStructuredDataAnalysisAnswer(request, additionalContext);
  if (structuredAnswer) {
    return structuredAnswer;
  }

  return sanitizeUserFacingAnswer(answer, request, additionalContext);
}

function sanitizeHallucinatedFieldMentions(
  answer: string,
  request: ChatRequest,
  additionalContext: Awaited<ReturnType<TableauContextProvider["getAdditionalContext"]>>,
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
    additionalContext.normalizedContext?.datasources?.map((datasource) => datasource.name).filter(Boolean) ??
    request.dashboardContext.dataSources?.map((datasource) => datasource.name).filter(Boolean) ??
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

function buildStrictFieldAnswerFromProfiles(profiles: DatasourceFieldProfile[], datasourceNames: string[]): string {
  const lines: string[] = [];
  const uniqueDatasourceNames = [...new Set(datasourceNames)];
  const headerDatasource = uniqueDatasourceNames.length
    ? uniqueDatasourceNames.join("、")
    : profiles.map((profile) => profile.datasourceName).join("、");
  lines.push(`このダッシュボードで確認できているデータソースは ${headerDatasource} です。`);
  lines.push("取得できたTableau Cloudのメタデータに基づくフィールド一覧は次のとおりです。");

  for (const profile of profiles) {
    lines.push(`- ${profile.datasourceName}（${profile.fieldCount}件）`);
    lines.push(`  ${profile.fieldNames.join("、")}`);
  }

  lines.push("上記以外のフィールド名は、今回取得できたメタデータでは確認できませんでした。");
  return lines.join("\n");
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

function hasSuccessfulDatasourceQuery(
  additionalContext: Awaited<ReturnType<TableauContextProvider["getAdditionalContext"]>>,
): boolean {
  return (
    additionalContext.mcpToolResults?.some((result) => result.toolName === "query-datasource" && result.status === "success") ?? false
  );
}

export function buildStructuredDataAnalysisAnswer(
  request: ChatRequest,
  additionalContext: Awaited<ReturnType<TableauContextProvider["getAdditionalContext"]>>,
): string | undefined {
  if (additionalContext.mcpExecutionDebug?.intent !== "data_analysis") {
    return undefined;
  }

  const insight = additionalContext.queryInsights?.find((candidate) => candidate.rows.length > 0);
  if (!insight) {
    return undefined;
  }

  const rows = insight.rows.filter((row) => row.label || row.value !== null);
  if (!rows.length) {
    return undefined;
  }

  const periodLabel = extractQuestionPeriodLabel(request.question);
  const metricLabel = describeMetricField(insight.metricField);
  const isRankingQuestion = /ランキング|rank(?:ing)?|上位|一覧|list/i.test(request.question);
  const visibleRows = rows.slice(0, isRankingQuestion ? Math.min(10, rows.length) : Math.min(3, rows.length));
  const intro = isRankingQuestion
    ? `${periodLabel ? `${periodLabel}の` : ""}${metricLabel}ランキングです。`
    : `${periodLabel ? `${periodLabel}の` : ""}${metricLabel}が高いVizです。`;
  const body = isRankingQuestion
    ? visibleRows.map((row, index) => `${index + 1}. ${row.label ?? "名称不明"}: ${formatMetricValue(row.value)}`).join("\n")
    : visibleRows
        .map((row) => `- ${row.label ?? "名称不明"}: ${formatMetricValue(row.value)}`)
        .join("\n");

  return [
    `${intro}`,
    `このダッシュボードで参照しているデータソース「${insight.datasourceName}」から集計しています。`,
    "",
    body,
  ].join("\n");
}

function extractQuestionPeriodLabel(question: string): string | undefined {
  const yearMonthMatch =
    question.match(/(20\d{2})[年\/\-](\d{1,2})月?/) ?? question.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月/);
  if (!yearMonthMatch?.[1] || !yearMonthMatch?.[2]) {
    return undefined;
  }

  const year = Number.parseInt(yearMonthMatch[1], 10);
  const month = Number.parseInt(yearMonthMatch[2], 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return undefined;
  }

  return `${year}年${month}月`;
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

