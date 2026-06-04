import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { getConfig } from "../config";
import { logError, logInfo, safeErrorDetails } from "../logging";
import type { TableauContextProvider } from "../tableau/contextProvider";
import {
  classifyQuestionIntent,
  QUESTION_INTENT_POLICY,
  type ClassifiedQuestionIntent,
} from "./tableauMcpToolPlanner";
import type { AuthenticatedUser } from "../types/auth";
import type {
  AgentEvaluation,
  AgentExecutionDebug,
  AgentPlan,
} from "../types/agent";
import type { ChatHistoryRecord, ChatRequest } from "../types/chat";
import type {
  McpExecutionDebug,
  TableauAdditionalContext,
  TableauDatasourceRef,
} from "../types/tableau";

const MAX_HISTORY_QUESTION_CHARS = 180;
const MAX_HISTORY_ANSWER_CHARS = 260;

export type AgentPromptContext = {
  agentPlanSummary?: string;
  investigationQuestion?: string;
  evaluationSummary?: string;
  evidenceGaps?: string[];
};

export type AgentLoopResult = {
  additionalContext: TableauAdditionalContext;
  promptContext: AgentPromptContext;
  debug?: AgentExecutionDebug;
};

export interface ChatAgent {
  readonly name: string;
  shouldRun(input: {
    request: ChatRequest;
    contextProvider: TableauContextProvider;
  }): boolean;
  createPlan(input: {
    request: ChatRequest;
    recentHistory: ChatHistoryRecord[];
    contextProvider: TableauContextProvider;
  }): Promise<{ plan: AgentPlan; source: "bedrock" | "heuristic" }>;
  evaluateContext(input: {
    request: ChatRequest;
    recentHistory: ChatHistoryRecord[];
    plan: AgentPlan;
    additionalContext: TableauAdditionalContext;
    contextPass: number;
  }): Promise<AgentEvaluation | undefined>;
}

export class NoopChatAgent implements ChatAgent {
  readonly name = "noop";

  shouldRun(): boolean {
    return false;
  }

  async createPlan(): Promise<{
    plan: AgentPlan;
    source: "bedrock" | "heuristic";
  }> {
    throw new Error("NoopChatAgent does not create plans.");
  }

  async evaluateContext(): Promise<AgentEvaluation | undefined> {
    return undefined;
  }
}

export class BedrockChatAgent implements ChatAgent {
  readonly name = "bedrock-chat-agent";

  constructor(
    private readonly client = new BedrockRuntimeClient({
      region: getConfig().model.bedrock.region,
    }),
  ) {}

  shouldRun(input: {
    request: ChatRequest;
    contextProvider: TableauContextProvider;
  }): boolean {
    const config = getConfig();
    if (!config.agent.enabled || config.model.provider !== "bedrock") {
      return false;
    }

    if (input.contextProvider.name === "mock") {
      return false;
    }

    return input.request.question.trim().length > 0;
  }

  async createPlan(input: {
    request: ChatRequest;
    recentHistory: ChatHistoryRecord[];
    contextProvider: TableauContextProvider;
  }): Promise<{ plan: AgentPlan; source: "bedrock" | "heuristic" }> {
    const fallback = buildHeuristicPlan(input.request);
    const config = getConfig();
    const prompt = buildPlanPrompt(
      input.request,
      input.recentHistory,
      input.contextProvider.name,
      fallback,
    );
    const startedAt = Date.now();

    try {
      logInfo("chat.agent.plan.started", {
        provider: input.contextProvider.name,
        promptLength: prompt.length,
      });
      const text = await this.sendJsonPrompt(
        prompt,
        config.agent.planMaxOutputTokens,
        "chat.agent.plan",
      );
      const parsed = parsePlanResponse(text, fallback);
      logInfo("chat.agent.plan.completed", {
        provider: input.contextProvider.name,
        durationMs: Date.now() - startedAt,
        intent: parsed.intent,
        needsMcp: parsed.needsMcp,
        confidence: parsed.confidence,
      });
      return { plan: parsed, source: "bedrock" };
    } catch (error) {
      logError("chat.agent.plan.failed", {
        ...safeErrorDetails(error),
        durationMs: Date.now() - startedAt,
      });
      return { plan: fallback, source: "heuristic" };
    }
  }

  async evaluateContext(input: {
    request: ChatRequest;
    recentHistory: ChatHistoryRecord[];
    plan: AgentPlan;
    additionalContext: TableauAdditionalContext;
    contextPass: number;
  }): Promise<AgentEvaluation | undefined> {
    const config = getConfig();
    if (
      !shouldEvaluateHeuristically(
        input.plan,
        input.additionalContext,
        input.contextPass,
        config.agent.maxContextPasses,
      )
    ) {
      return undefined;
    }

    const prompt = buildEvaluationPrompt(
      input.request,
      input.plan,
      input.additionalContext,
      input.recentHistory,
      input.contextPass,
    );
    const startedAt = Date.now();
    try {
      logInfo("chat.agent.evaluate.started", {
        pass: input.contextPass + 1,
        promptLength: prompt.length,
      });
      const text = await this.sendJsonPrompt(
        prompt,
        config.agent.evaluationMaxOutputTokens,
        "chat.agent.evaluate",
      );
      const evaluation = parseEvaluationResponse(text);
      logInfo("chat.agent.evaluate.completed", {
        pass: input.contextPass + 1,
        durationMs: Date.now() - startedAt,
        isSufficient: evaluation?.isSufficient,
        confidence: evaluation?.confidence,
        hasFollowUpQuestion: Boolean(evaluation?.followUpQuestion),
      });
      return evaluation;
    } catch (error) {
      logError("chat.agent.evaluate.failed", {
        ...safeErrorDetails(error),
        durationMs: Date.now() - startedAt,
      });
      return undefined;
    }
  }

  private async sendJsonPrompt(
    prompt: string,
    maxTokens: number,
    eventPrefix: string,
  ): Promise<string> {
    const config = getConfig();
    if (config.agent.debugLogPromptExchange) {
      const promptSnapshot = clipForDebugLog(
        prompt,
        config.agent.debugMaxChars,
      );
      logInfo(`${eventPrefix}.prompt_debug`, {
        promptLength: prompt.length,
        promptPreviewLength: promptSnapshot.text.length,
        promptPreviewTruncated: promptSnapshot.truncated,
        promptPreview: promptSnapshot.text,
      });
    }

    const response = await this.client.send(
      new ConverseCommand({
        modelId: config.model.bedrock.modelId,
        messages: [{ role: "user", content: [{ text: prompt }] }],
        inferenceConfig: {
          maxTokens,
          temperature: 0,
        },
      }),
    );

    const text =
      response.output?.message?.content
        ?.map((content) => ("text" in content ? content.text : ""))
        .filter(Boolean)
        .join("\n")
        .trim() ?? "";
    if (!text) {
      throw new Error("Agent model returned an empty response.");
    }

    if (config.agent.debugLogPromptExchange) {
      const responseSnapshot = clipForDebugLog(
        text,
        config.agent.debugMaxChars,
      );
      logInfo(`${eventPrefix}.response_debug`, {
        responseLength: text.length,
        responsePreviewLength: responseSnapshot.text.length,
        responsePreviewTruncated: responseSnapshot.truncated,
        responsePreview: responseSnapshot.text,
      });
    }

    return text;
  }
}

export async function runLightweightAgentLoop(input: {
  agent: ChatAgent;
  contextProvider: TableauContextProvider;
  request: ChatRequest;
  recentHistory: ChatHistoryRecord[];
  authenticatedUser?: AuthenticatedUser;
  tableauSubject?: string;
}): Promise<AgentLoopResult> {
  const config = getConfig();
  if (
    !input.agent.shouldRun({
      request: input.request,
      contextProvider: input.contextProvider,
    })
  ) {
    const additionalContext = await input.contextProvider.getAdditionalContext({
      dashboardContext: input.request.dashboardContext,
      question: input.request.question,
      authenticatedUser: input.authenticatedUser,
      tableauSubject: input.tableauSubject,
    });
    return {
      additionalContext,
      promptContext: {},
    };
  }

  const { plan, source } = await input.agent.createPlan({
    request: input.request,
    recentHistory: input.recentHistory,
    contextProvider: input.contextProvider,
  });

  const passes: AgentExecutionDebug["passes"] = [];
  const collectedContexts: TableauAdditionalContext[] = [];
  const attemptedQuestions = new Set<string>();
  let planningQuestion = plan.normalizedQuestion || input.request.question;
  let latestEvaluation: AgentEvaluation | undefined;
  let fallbackReason: string | undefined;

  for (let pass = 0; pass < config.agent.maxContextPasses; pass += 1) {
    if (attemptedQuestions.has(planningQuestion)) {
      fallbackReason = "agent_repeated_follow_up_question";
      break;
    }
    attemptedQuestions.add(planningQuestion);

    const additionalContext = await input.contextProvider.getAdditionalContext({
      dashboardContext: input.request.dashboardContext,
      question: input.request.question,
      planningQuestion,
      intentHint: toIntentHint(plan),
      authenticatedUser: input.authenticatedUser,
      tableauSubject: input.tableauSubject,
    });
    collectedContexts.push(additionalContext);

    const mergedContext = mergeAdditionalContexts(collectedContexts);
    latestEvaluation = await input.agent.evaluateContext({
      request: input.request,
      recentHistory: input.recentHistory,
      plan,
      additionalContext: mergedContext,
      contextPass: pass,
    });

    passes.push({
      planningQuestion,
      provider: additionalContext.provider,
      warningCount: additionalContext.warnings?.length ?? 0,
      hasMetadata: hasResolvedMetadata(additionalContext),
      hasQueryInsight: Boolean(
        additionalContext.queryInsights?.some(
          (insight) => insight.rows.length > 0,
        ),
      ),
      ...(latestEvaluation ? { evaluation: latestEvaluation } : {}),
    });

    if (
      !latestEvaluation ||
      latestEvaluation.isSufficient ||
      !latestEvaluation.followUpQuestion
    ) {
      break;
    }

    planningQuestion = latestEvaluation.followUpQuestion.trim();
    if (!planningQuestion) {
      break;
    }
  }

  const mergedContext = mergeAdditionalContexts(collectedContexts);
  return {
    additionalContext: mergedContext,
    promptContext: {
      agentPlanSummary: summarizePlan(plan),
      investigationQuestion:
        plan.normalizedQuestion !== input.request.question
          ? plan.normalizedQuestion
          : undefined,
      evaluationSummary: latestEvaluation
        ? summarizeEvaluation(latestEvaluation)
        : undefined,
      evidenceGaps: latestEvaluation?.missingEvidence.length
        ? latestEvaluation.missingEvidence
        : undefined,
    },
    debug: {
      enabled: true,
      planSource: source,
      passCount: passes.length,
      plan,
      passes,
      ...(fallbackReason ? { fallbackReason } : {}),
    },
  };
}

function buildHeuristicPlan(request: ChatRequest): AgentPlan {
  const intent = classifyQuestionIntent(
    request.question,
    request.dashboardContext,
    [],
  );
  return {
    intent: intent.intent,
    confidence: intent.confidence,
    normalizedQuestion: request.question.trim(),
    needsMcp: intent.needsMcp,
    answerStyle: /ランキング|rank(?:ing)?|top|上位/i.test(request.question)
      ? "ranking"
      : "direct",
    reasonBrief: intent.reasonBrief,
    requiredEvidence: inferRequiredEvidence(request.question, intent),
  };
}

function inferRequiredEvidence(
  question: string,
  intent: ClassifiedQuestionIntent,
): string[] {
  if (intent.intent === "metadata_lookup") {
    return ["datasource metadata", "field list"];
  }
  if (intent.intent === "data_analysis") {
    return /ランキング|rank(?:ing)?|top|上位/i.test(question)
      ? ["datasource-backed aggregate ranking", "time filter if specified"]
      : ["datasource-backed aggregate result"];
  }
  if (intent.intent === "content_search") {
    return ["Tableau content match"];
  }
  return ["dashboard context"];
}

function buildPlanPrompt(
  request: ChatRequest,
  recentHistory: ChatHistoryRecord[],
  providerName: TableauAdditionalContext["provider"],
  fallback: AgentPlan,
): string {
  return [
    "You are a lightweight orchestration planner for a Tableau assistant.",
    "Return JSON only.",
    "Interpret ambiguous user requests into a more explicit investigation question for downstream Tableau context retrieval.",
    "Do not mention internal tool names.",
    "Keep reasonBrief short.",
    `Context provider: ${providerName}`,
    `Fallback intent: ${fallback.intent}`,
    `User question: ${request.question}`,
    recentHistory.length
      ? [
          "Recent conversation:",
          ...recentHistory
            .slice(0, 3)
            .flatMap((record, index) => [
              `Turn ${index + 1} user: ${truncateText(record.question, MAX_HISTORY_QUESTION_CHARS)}`,
              `Turn ${index + 1} assistant: ${truncateText(record.answer, MAX_HISTORY_ANSWER_CHARS)}`,
            ]),
        ].join("\n")
      : "",
    `Dashboard name: ${request.dashboardContext.dashboardName}`,
    `Workbook name: ${request.dashboardContext.workbookName ?? "unknown"}`,
    `Datasource hints: ${(request.dashboardContext.dataSources ?? []).map((datasource) => datasource.name).join(", ") || "none"}`,
    'Schema: {"intent":"data_analysis","confidence":0.0,"normalizedQuestion":"explicit investigation question","needsMcp":true,"answerStyle":"ranking","reasonBrief":"short reason","requiredEvidence":["evidence 1","evidence 2"]}',
  ]
    .filter(Boolean)
    .join("\n");
}

function buildEvaluationPrompt(
  request: ChatRequest,
  plan: AgentPlan,
  additionalContext: TableauAdditionalContext,
  recentHistory: ChatHistoryRecord[],
  contextPass: number,
): string {
  return [
    "You are evaluating whether the collected Tableau evidence is sufficient to answer the user safely.",
    "Return JSON only.",
    "If sufficient, set isSufficient to true and omit followUpQuestion.",
    "If insufficient but another retrieval pass could help, provide exactly one short followUpQuestion in the same language as the user question.",
    "Do not mention internal tool names.",
    `User question: ${request.question}`,
    `Investigation question: ${plan.normalizedQuestion}`,
    `Plan intent: ${plan.intent}`,
    `Required evidence: ${plan.requiredEvidence.join(", ")}`,
    `Context pass: ${contextPass + 1}`,
    recentHistory.length
      ? `Recent assistant context: ${truncateText(recentHistory.at(-1)?.answer ?? "", MAX_HISTORY_ANSWER_CHARS)}`
      : "",
    `Collected evidence summary: ${summarizeContextForEvaluation(additionalContext)}`,
    'Schema: {"isSufficient":true,"confidence":0.0,"reasonBrief":"short reason","missingEvidence":["optional"],"followUpQuestion":"optional"}',
  ]
    .filter(Boolean)
    .join("\n");
}

function parsePlanResponse(text: string, fallback: AgentPlan): AgentPlan {
  const record = parseJsonRecord(text);
  if (!record) {
    return fallback;
  }

  return {
    intent: readIntent(record.intent) ?? fallback.intent,
    confidence: clampNumber(record.confidence, fallback.confidence),
    normalizedQuestion:
      typeof record.normalizedQuestion === "string" &&
      record.normalizedQuestion.trim()
        ? record.normalizedQuestion.trim()
        : fallback.normalizedQuestion,
    needsMcp:
      typeof record.needsMcp === "boolean"
        ? record.needsMcp
        : fallback.needsMcp,
    answerStyle: readAnswerStyle(record.answerStyle) ?? fallback.answerStyle,
    reasonBrief:
      typeof record.reasonBrief === "string" && record.reasonBrief.trim()
        ? record.reasonBrief.trim().slice(0, 220)
        : fallback.reasonBrief,
    requiredEvidence:
      readStringArray(record.requiredEvidence) ?? fallback.requiredEvidence,
  };
}

function parseEvaluationResponse(text: string): AgentEvaluation | undefined {
  const record = parseJsonRecord(text);
  if (!record) {
    return undefined;
  }

  if (typeof record.isSufficient !== "boolean") {
    return undefined;
  }

  const followUpQuestion =
    typeof record.followUpQuestion === "string" &&
    record.followUpQuestion.trim()
      ? record.followUpQuestion.trim().slice(0, 240)
      : undefined;

  return {
    isSufficient: record.isSufficient,
    confidence: clampNumber(record.confidence, 0.6),
    reasonBrief:
      typeof record.reasonBrief === "string" && record.reasonBrief.trim()
        ? record.reasonBrief.trim().slice(0, 220)
        : "Evaluation completed.",
    missingEvidence: readStringArray(record.missingEvidence) ?? [],
    ...(followUpQuestion ? { followUpQuestion } : {}),
  };
}

function parseJsonRecord(text: string): Record<string, unknown> | undefined {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced ?? trimmed;
  const first = candidate.indexOf("{");
  const last = candidate.lastIndexOf("}");
  const jsonText =
    first >= 0 && last > first ? candidate.slice(first, last + 1) : candidate;

  try {
    const parsed = JSON.parse(jsonText) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function readIntent(value: unknown): AgentPlan["intent"] | undefined {
  if (
    value === "dashboard_explanation" ||
    value === "filter_or_selection_state" ||
    value === "metadata_lookup" ||
    value === "data_analysis" ||
    value === "content_search" ||
    value === "how_to_use_tableau" ||
    value === "unsupported"
  ) {
    return value;
  }

  return undefined;
}

function readAnswerStyle(value: unknown): AgentPlan["answerStyle"] | undefined {
  return value === "direct" || value === "ranking" || value === "summary"
    ? value
    : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const result = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);

  return result.length ? result : undefined;
}

function clampNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : fallback;
}

function summarizePlan(plan: AgentPlan): string {
  return `${plan.reasonBrief} Intent=${plan.intent}, answerStyle=${plan.answerStyle}, requiredEvidence=${plan.requiredEvidence.join(", ") || "none"}.`;
}

function summarizeEvaluation(evaluation: AgentEvaluation): string {
  return `${evaluation.reasonBrief} sufficient=${String(evaluation.isSufficient)} confidence=${evaluation.confidence.toFixed(2)}`;
}

function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars).trimEnd()}...`;
}

function clipForDebugLog(
  value: string,
  maxChars: number,
): { text: string; truncated: boolean } {
  if (value.length <= maxChars) {
    return { text: value, truncated: false };
  }

  return {
    text: `${value.slice(0, maxChars)}...`,
    truncated: true,
  };
}

function toIntentHint(plan: AgentPlan): ClassifiedQuestionIntent {
  const policy = QUESTION_INTENT_POLICY[plan.intent];
  return {
    intent: plan.intent,
    confidence: plan.confidence,
    reasonBrief: plan.reasonBrief,
    answerableFromDashboardContext: policy.answerableFromDashboardContext,
    needsMcp: plan.needsMcp,
    maxToolCalls: policy.maxToolCalls,
  };
}

function shouldEvaluateHeuristically(
  plan: AgentPlan,
  additionalContext: TableauAdditionalContext,
  contextPass: number,
  maxContextPasses: number,
): boolean {
  if (contextPass + 1 >= maxContextPasses) {
    return false;
  }

  if (
    plan.intent === "metadata_lookup" &&
    !hasResolvedMetadata(additionalContext)
  ) {
    return true;
  }

  if (
    plan.intent === "data_analysis" &&
    !(
      additionalContext.queryInsights?.some(
        (insight) => insight.rows.length > 0,
      ) ?? false
    )
  ) {
    return true;
  }

  if ((additionalContext.warnings?.length ?? 0) > 0) {
    return true;
  }

  if (
    (additionalContext.mcpExecutionDebug?.toolCallCount ?? 0) === 0 &&
    plan.needsMcp
  ) {
    return true;
  }

  return false;
}

function summarizeContextForEvaluation(
  additionalContext: TableauAdditionalContext,
): string {
  return JSON.stringify({
    provider: additionalContext.provider,
    datasourceCount: additionalContext.datasources?.length ?? 0,
    fieldProfileCount: additionalContext.datasourceFieldProfiles?.length ?? 0,
    queryInsightCount: additionalContext.queryInsights?.length ?? 0,
    warningCount: additionalContext.warnings?.length ?? 0,
    warnings: additionalContext.warnings?.slice(0, 4),
    executedTools: additionalContext.mcpExecutionDebug?.executedTools ?? [],
    blockedTools: additionalContext.mcpExecutionDebug?.blockedTools ?? [],
    skippedTools: additionalContext.mcpExecutionDebug?.skippedTools ?? [],
  });
}

export function mergeAdditionalContexts(
  contexts: TableauAdditionalContext[],
): TableauAdditionalContext {
  const latest = contexts.at(-1);
  if (!latest) {
    return { provider: "mock" };
  }

  const workbook = contexts.map((context) => context.workbook).find(Boolean);
  const metadata = [...contexts]
    .reverse()
    .map((context) => context.metadata)
    .find(Boolean);

  return {
    provider: latest.provider,
    ...(workbook ? { workbook } : {}),
    datasources: dedupeByKey(
      contexts.flatMap(
        (context) =>
          (context.datasources as TableauDatasourceRef[] | undefined) ?? [],
      ),
      (datasource) =>
        `${datasource.type}:${datasource.luid ?? datasource.id ?? datasource.name}`,
    ),
    datasourceFieldProfiles: dedupeByKey(
      contexts.flatMap((context) => context.datasourceFieldProfiles ?? []),
      (profile) => `${profile.datasourceName}:${profile.fieldNames.join("|")}`,
    ),
    queryInsights: dedupeByKey(
      contexts.flatMap((context) => context.queryInsights ?? []),
      (insight) =>
        `${insight.datasourceLuid ?? insight.datasourceName}:${insight.metricField}:${insight.dimensionField ?? ""}`,
    ),
    normalizedContext: mergeNormalizedContexts(contexts),
    ...(metadata ? { metadata } : {}),
    mcpTools: dedupeByKey(
      contexts.flatMap((context) => context.mcpTools ?? []),
      (tool) => tool.name,
    ),
    mcpToolResults: contexts.flatMap((context) => context.mcpToolResults ?? []),
    mcpObservations: contexts.flatMap(
      (context) => context.mcpObservations ?? [],
    ),
    mcpExecutionDebug: mergeMcpExecutionDebugs(
      contexts
        .map((context) => context.mcpExecutionDebug)
        .filter(Boolean) as McpExecutionDebug[],
    ),
    warnings: dedupePrimitive(
      contexts.flatMap((context) => context.warnings ?? []),
    ),
  };
}

function mergeNormalizedContexts(
  contexts: TableauAdditionalContext[],
): TableauAdditionalContext["normalizedContext"] | undefined {
  const normalizedContexts = contexts
    .map((context) => context.normalizedContext)
    .filter(Boolean);
  const latest = normalizedContexts.at(-1);
  if (!latest) {
    return undefined;
  }

  return {
    dashboard: latest.dashboard,
    workbook:
      latest.workbook ??
      normalizedContexts.find((context) => context?.workbook)?.workbook,
    project:
      latest.project ??
      normalizedContexts.find((context) => context?.project)?.project,
    datasources: dedupeByKey(
      normalizedContexts.flatMap((context) => context?.datasources ?? []),
      (datasource) =>
        `${datasource.type}:${datasource.luid ?? datasource.id ?? datasource.name}`,
    ),
    projects: dedupeByKey(
      normalizedContexts.flatMap((context) => context?.projects ?? []),
      (project) => `${project.type}:${project.id ?? project.name}`,
    ),
    views: dedupeByKey(
      normalizedContexts.flatMap((context) => context?.views ?? []),
      (view) => `${view.type}:${view.id ?? view.name}`,
    ),
  };
}

function mergeMcpExecutionDebugs(
  debugs: McpExecutionDebug[],
): McpExecutionDebug | undefined {
  const latest = debugs.at(-1);
  if (!latest) {
    return undefined;
  }

  return {
    ...latest,
    plannedTools: dedupePrimitive(
      debugs.flatMap((debug) => debug.plannedTools),
    ),
    blockedTools: dedupePrimitive(
      debugs.flatMap((debug) => debug.blockedTools),
    ),
    executedTools: dedupePrimitive(
      debugs.flatMap((debug) => debug.executedTools),
    ),
    skippedTools: dedupePrimitive(
      debugs.flatMap((debug) => debug.skippedTools),
    ),
    toolCallCount: debugs.reduce((sum, debug) => sum + debug.toolCallCount, 0),
    replanUsed: debugs.some((debug) => debug.replanUsed),
    timingMs: {
      planning: debugs.reduce((sum, debug) => sum + debug.timingMs.planning, 0),
      execution: debugs.reduce(
        (sum, debug) => sum + debug.timingMs.execution,
        0,
      ),
    },
    fallbackReason:
      dedupePrimitive(
        debugs.map((debug) => debug.fallbackReason).filter(Boolean) as string[],
      ).join("; ") || undefined,
  };
}

function dedupeByKey<T>(items: T[], getKey: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function dedupePrimitive(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

function hasResolvedMetadata(
  additionalContext: TableauAdditionalContext,
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
