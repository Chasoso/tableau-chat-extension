import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { getConfig } from "../config";
import { logError, logInfo, logWarn, safeErrorDetails } from "../logging";
import type { DashboardContext, QuestionIntent } from "../types/tableau";

export type McpToolForPlanning = {
  name: string;
  description?: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
};

export type PlannedMcpToolCall = {
  toolName: string;
  arguments?: Record<string, unknown>;
  purpose?: string;
  reason?: string;
  dependsOnTool?: string;
};

export type IntentPolicy = {
  maxToolCalls: number;
  needsMcp: boolean;
  answerableFromDashboardContext: boolean;
};

export const QUESTION_INTENT_POLICY: Record<QuestionIntent, IntentPolicy> = {
  dashboard_explanation: {
    maxToolCalls: 3,
    needsMcp: false,
    answerableFromDashboardContext: true,
  },
  filter_or_selection_state: {
    maxToolCalls: 3,
    needsMcp: false,
    answerableFromDashboardContext: true,
  },
  metadata_lookup: {
    maxToolCalls: 5,
    needsMcp: true,
    answerableFromDashboardContext: false,
  },
  data_analysis: {
    maxToolCalls: 8,
    needsMcp: true,
    answerableFromDashboardContext: false,
  },
  content_search: {
    maxToolCalls: 5,
    needsMcp: true,
    answerableFromDashboardContext: false,
  },
  how_to_use_tableau: {
    maxToolCalls: 2,
    needsMcp: false,
    answerableFromDashboardContext: true,
  },
  unsupported: {
    maxToolCalls: 0,
    needsMcp: false,
    answerableFromDashboardContext: false,
  },
};

export type ClassifiedQuestionIntent = {
  intent: QuestionIntent;
  confidence: number;
  reasonBrief: string;
  answerableFromDashboardContext: boolean;
  needsMcp: boolean;
  maxToolCalls: number;
};

export type McpToolPlan = {
  intent: QuestionIntent;
  confidence: number;
  answerableFromDashboardContext: boolean;
  needsMcp: boolean;
  reasonBrief: string;
  maxToolCalls: number;
  toolCalls: PlannedMcpToolCall[];
};

export type McpToolPlannerInput = {
  question: string;
  dashboardContext: DashboardContext;
  tools: McpToolForPlanning[];
  maxToolCalls: number;
  allowedToolNames: string[];
  observations?: Array<{
    toolName: string;
    status: string;
    summary?: string;
    warning?: string;
  }>;
  previouslyCalledToolNames?: string[];
  intentHint?: ClassifiedQuestionIntent;
};

const DEFAULT_PLANNING_ALLOWLIST = [
  "list-workbooks",
  "get-workbook",
  "list-views",
  "list-datasources",
  "get-datasource-metadata",
  "query-datasource",
  "search-content",
];

const TOOL_NAME_FOR_INTENT: Record<QuestionIntent, string[]> = {
  dashboard_explanation: ["list-workbooks", "get-workbook", "list-views"],
  filter_or_selection_state: ["list-views", "get-workbook"],
  metadata_lookup: ["list-datasources", "get-datasource-metadata", "list-views", "get-workbook"],
  data_analysis: ["list-datasources", "get-datasource-metadata", "query-datasource", "list-views"],
  content_search: ["search-content", "list-workbooks", "list-views", "list-datasources"],
  how_to_use_tableau: [],
  unsupported: [],
};

export class TableauMcpToolPlanner {
  constructor(
    private readonly client = new BedrockRuntimeClient({ region: getConfig().model.bedrock.region }),
  ) {}

  async plan(input: McpToolPlannerInput): Promise<McpToolPlan | undefined> {
    const config = getConfig();
    const mcpConfig = config.tableau.mcp;

    if (!mcpConfig.toolPlanningEnabled) {
      return undefined;
    }

    if (config.model.provider !== "bedrock") {
      logWarn("tableau.mcp.tool_planner.skipped", {
        reason: "MODEL_PROVIDER is not bedrock.",
      });
      return undefined;
    }

    const intent = input.intentHint ?? classifyQuestionIntent(input.question, input.dashboardContext, input.allowedToolNames);
    if (!intent.needsMcp || intent.maxToolCalls <= 0) {
      logInfo("tableau.mcp.tool_planner.skipped", {
        reason: "Intent indicates MCP is unnecessary.",
        intent: intent.intent,
      });
      return {
        intent: intent.intent,
        confidence: intent.confidence,
        answerableFromDashboardContext: intent.answerableFromDashboardContext,
        needsMcp: false,
        reasonBrief: intent.reasonBrief,
        maxToolCalls: 0,
        toolCalls: [],
      };
    }

    const allowedToolNames = resolveAllowedToolNames(input.tools, input.allowedToolNames).filter((toolName) =>
      TOOL_NAME_FOR_INTENT[intent.intent].length ? TOOL_NAME_FOR_INTENT[intent.intent].includes(toolName) : true,
    );
    const maxToolCalls = Math.max(0, Math.min(input.maxToolCalls, intent.maxToolCalls));
    const prompt = buildPlannerPrompt({
      ...input,
      maxToolCalls,
      allowedToolNames,
      intent,
    });

    const startedAt = Date.now();
    try {
      logInfo("tableau.mcp.tool_planner.started", {
        modelId: config.model.bedrock.modelId,
        maxToolCalls,
        availableToolCount: input.tools.length,
        allowedToolCount: allowedToolNames.length,
        observationCount: input.observations?.length ?? 0,
        promptLength: prompt.length,
        intent: intent.intent,
        intentConfidence: intent.confidence,
      });

      const response = await this.client.send(
        new ConverseCommand({
          modelId: config.model.bedrock.modelId,
          messages: [
            {
              role: "user",
              content: [{ text: prompt }],
            },
          ],
          inferenceConfig: {
            maxTokens: mcpConfig.plannerMaxOutputTokens,
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
      const plan = parseToolPlanResponse(text, intent);

      if (!plan?.toolCalls.length) {
        logWarn("tableau.mcp.tool_planner.empty_plan", {
          responseLength: text.length,
          durationMs: Date.now() - startedAt,
        });
        return {
          intent: intent.intent,
          confidence: intent.confidence,
          answerableFromDashboardContext: intent.answerableFromDashboardContext,
          needsMcp: intent.needsMcp,
          reasonBrief: intent.reasonBrief,
          maxToolCalls,
          toolCalls: [],
        };
      }

      const filteredToolCalls = plan.toolCalls.filter((call) => allowedToolNames.includes(call.toolName)).slice(0, maxToolCalls);
      const blockedToolCount = Math.max(plan.toolCalls.length - filteredToolCalls.length, 0);

      logInfo("tableau.mcp.tool_planner.completed", {
        plannedToolCount: filteredToolCalls.length,
        plannedTools: filteredToolCalls.map((call) => call.toolName),
        blockedToolCount,
        durationMs: Date.now() - startedAt,
      });
      return {
        ...plan,
        maxToolCalls,
        toolCalls: filteredToolCalls,
      };
    } catch (error) {
      logError("tableau.mcp.tool_planner.failed", {
        ...safeErrorDetails(error),
        durationMs: Date.now() - startedAt,
      });
      return undefined;
    }
  }
}

export function classifyQuestionIntent(
  question: string,
  dashboardContext: DashboardContext,
  allowedToolNames: string[] = [],
): ClassifiedQuestionIntent {
  const normalizedQuestion = question.toLowerCase();
  const hasFilterKeywords = /filter|filtered|selection|selected mark|parameter|where|slice|drill|絞り込み|フィルター|選択|パラメーター/.test(
    normalizedQuestion,
  );
  const hasMetadataKeywords =
    /field|schema|column|metric definition|datasource|data source|metadata|workbook id|view id|フィールド|データソース|メタデータ/.test(
      normalizedQuestion,
    );
  const hasAnalysisKeywords =
    /sum|average|avg|count|countd|rank|ranking|top|bottom|trend|month|week|day|compare|increase|decrease|growth|推移|傾向|集計|ランキング|増減/.test(
      normalizedQuestion,
    );
  const hasContentSearchKeywords =
    /search|find|locate|where is|which workbook|which view|content|asset|コンテンツ|探し|検索|どこ/.test(normalizedQuestion);
  const hasHowToKeywords =
    /how to|how do i|steps|procedure|使い方|方法|どうやって|やり方/.test(normalizedQuestion);
  const hasDashboardExplanationKeywords =
    /what is this dashboard|describe this dashboard|overview|summary|このダッシュボード|概要|説明/.test(normalizedQuestion);

  const knownDatasourceMentioned =
    dashboardContext.dataSources?.some((dataSource) => normalizedQuestion.includes(dataSource.name.toLowerCase())) ?? false;
  const hasSearchTool = allowedToolNames.includes("search-content");
  const hasQueryTool = allowedToolNames.includes("query-datasource");

  let intent: QuestionIntent = "unsupported";
  let confidence = 0.45;
  let reasonBrief = "The question does not clearly map to a supported Tableau context workflow.";

  if (hasHowToKeywords) {
    intent = "how_to_use_tableau";
    confidence = 0.8;
    reasonBrief = "The question asks procedural Tableau usage guidance.";
  } else if (hasFilterKeywords) {
    intent = "filter_or_selection_state";
    confidence = 0.86;
    reasonBrief = "The question focuses on current filters, selections, or parameter state.";
  } else if (hasAnalysisKeywords || (knownDatasourceMentioned && hasQueryTool)) {
    intent = "data_analysis";
    confidence = hasQueryTool ? 0.88 : 0.72;
    reasonBrief = "The question asks for aggregated values, trends, or ranking analysis.";
  } else if (hasMetadataKeywords || knownDatasourceMentioned) {
    intent = "metadata_lookup";
    confidence = 0.84;
    reasonBrief = "The question asks about datasources, fields, or workbook/view metadata.";
  } else if (hasContentSearchKeywords && hasSearchTool) {
    intent = "content_search";
    confidence = 0.8;
    reasonBrief = "The question asks to locate Tableau Cloud content.";
  } else if (hasDashboardExplanationKeywords || dashboardContext.worksheets.length > 0) {
    intent = "dashboard_explanation";
    confidence = hasDashboardExplanationKeywords ? 0.78 : 0.58;
    reasonBrief = "The question can likely be handled from the active dashboard context.";
  }

  const policy = QUESTION_INTENT_POLICY[intent];
  return {
    intent,
    confidence,
    reasonBrief,
    answerableFromDashboardContext: policy.answerableFromDashboardContext,
    needsMcp: policy.needsMcp,
    maxToolCalls: policy.maxToolCalls,
  };
}

export function parseToolPlanResponse(
  text: string,
  fallbackIntent?: ClassifiedQuestionIntent,
): McpToolPlan | undefined {
  const jsonText = extractJsonObject(text);
  if (!jsonText) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(jsonText) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return undefined;
    }

    const record = parsed as Record<string, unknown>;
    const toolCallsSource = Array.isArray(record.toolCalls) ? record.toolCalls : Array.isArray(record.steps) ? record.steps : [];
    const normalizedCalls = toolCallsSource
      .map(normalizeToolCall)
      .filter((call): call is PlannedMcpToolCall => Boolean(call));

    const intent = readIntent(record.intent) ?? fallbackIntent?.intent ?? "unsupported";
    const confidence = clampNumber(record.confidence, 0, 1, fallbackIntent?.confidence ?? 0.6);
    const answerableFromDashboardContext =
      typeof record.answerableFromDashboardContext === "boolean"
        ? record.answerableFromDashboardContext
        : (fallbackIntent?.answerableFromDashboardContext ?? false);
    const needsMcp = typeof record.needsMcp === "boolean" ? record.needsMcp : (fallbackIntent?.needsMcp ?? true);
    const reasonBrief =
      typeof record.reasonBrief === "string" && record.reasonBrief.trim()
        ? record.reasonBrief.trim().slice(0, 220)
        : (fallbackIntent?.reasonBrief ?? "Planner selected MCP tools for this question.");
    const maxToolCalls = clampNumber(record.maxToolCalls, 0, 12, fallbackIntent?.maxToolCalls ?? normalizedCalls.length);

    return {
      intent,
      confidence,
      answerableFromDashboardContext,
      needsMcp,
      reasonBrief,
      maxToolCalls,
      toolCalls: normalizedCalls.slice(0, maxToolCalls),
    };
  } catch {
    return undefined;
  }
}

export function resolveAllowedToolNames(tools: McpToolForPlanning[], configuredAllowedTools: string[]): string[] {
  const available = new Set(tools.map((tool) => tool.name));
  const desired = configuredAllowedTools.length ? configuredAllowedTools : DEFAULT_PLANNING_ALLOWLIST;
  return desired.filter((toolName) => available.has(toolName));
}

function normalizeToolCall(value: unknown): PlannedMcpToolCall | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const toolName = typeof record.toolName === "string" ? record.toolName : typeof record.tool === "string" ? record.tool : "";
  if (!toolName.trim()) {
    return undefined;
  }

  const args = record.arguments && isPlainObject(record.arguments) ? sanitizeToolArguments(record.arguments) : undefined;
  const purpose = typeof record.purpose === "string" ? record.purpose.slice(0, 220) : undefined;
  const reason = typeof record.reason === "string" ? record.reason.slice(0, 220) : undefined;
  const dependsOnTool =
    typeof record.dependsOnTool === "string"
      ? record.dependsOnTool.trim()
      : typeof record.dependsOn === "string"
        ? record.dependsOn.trim()
        : undefined;

  return {
    toolName: toolName.trim(),
    ...(args ? { arguments: args } : {}),
    ...(purpose ? { purpose } : {}),
    ...(reason ? { reason } : {}),
    ...(dependsOnTool ? { dependsOnTool } : {}),
  };
}

function sanitizeToolArguments(value: unknown): Record<string, unknown> | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  const sanitized = Object.fromEntries(
    Object.entries(value).filter(([key, child]) => {
      if (/token|secret|password|jwt|authorization|credential|cookie/i.test(key)) {
        return false;
      }

      return isJsonSafeValue(child, 0);
    }),
  );

  return Object.keys(sanitized).length ? sanitized : undefined;
}

function isJsonSafeValue(value: unknown, depth: number): boolean {
  if (depth > 5) {
    return false;
  }

  if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.length <= 50 && value.every((item) => isJsonSafeValue(item, depth + 1));
  }

  if (isPlainObject(value)) {
    return Object.keys(value).length <= 30 && Object.values(value).every((item) => isJsonSafeValue(item, depth + 1));
  }

  return false;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractJsonObject(text: string): string | undefined {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced?.startsWith("{") && fenced.endsWith("}")) {
    return fenced;
  }

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) {
    return trimmed.slice(first, last + 1);
  }

  return undefined;
}

function readIntent(value: unknown): QuestionIntent | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  if (
    normalized === "dashboard_explanation" ||
    normalized === "filter_or_selection_state" ||
    normalized === "metadata_lookup" ||
    normalized === "data_analysis" ||
    normalized === "content_search" ||
    normalized === "how_to_use_tableau" ||
    normalized === "unsupported"
  ) {
    return normalized;
  }

  return undefined;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, numeric));
}

function buildPlannerPrompt(
  input: McpToolPlannerInput & { allowedToolNames: string[]; intent: ClassifiedQuestionIntent; maxToolCalls: number },
): string {
  return [
    "You are a strict planner for Tableau MCP tool calls.",
    "Return JSON only and follow the schema exactly.",
    "Keep reasonBrief and purpose short.",
    "Never invent IDs. If an ID is unknown, leave args empty and add dependsOnTool.",
    "Use only allowlisted tools.",
    "Avoid query-datasource unless aggregate analysis is required.",
    "For query-datasource, always include a small limit and aggregate fields.",
    `Maximum tool calls: ${input.maxToolCalls}`,
    `Allowed tools: ${input.allowedToolNames.join(", ") || "none"}`,
    `Classified intent: ${input.intent.intent} (confidence=${input.intent.confidence.toFixed(2)})`,
    `Intent reason: ${input.intent.reasonBrief}`,
    `Previously called tools: ${input.previouslyCalledToolNames?.join(", ") || "none"}`,
    "Available tool summaries:",
    JSON.stringify(buildToolSummaries(input.tools, input.allowedToolNames)),
    "Previous observations:",
    JSON.stringify(
      (input.observations ?? []).map((observation) => ({
        toolName: observation.toolName,
        status: observation.status,
        summary: observation.summary?.slice(0, 800),
        warning: observation.warning,
      })),
    ),
    "Dashboard context summary:",
    JSON.stringify({
      dashboardName: input.dashboardContext.dashboardName,
      workbookName: input.dashboardContext.workbookName,
      worksheetNames: input.dashboardContext.worksheets.map((worksheet) => worksheet.name),
      filterNames: input.dashboardContext.filters.map((filter) => filter.fieldName),
      parameterNames: input.dashboardContext.parameters.map((parameter) => parameter.name),
      dataSourceHints: input.dashboardContext.dataSources?.map((datasource) => ({
        name: datasource.name,
        id: datasource.id,
      })),
    }),
    `User question: ${input.question}`,
    'Schema: {"intent":"data_analysis","confidence":0.0,"answerableFromDashboardContext":false,"needsMcp":true,"reasonBrief":"short reason","maxToolCalls":4,"toolCalls":[{"toolName":"list-datasources","purpose":"short purpose","arguments":{},"dependsOnTool":"optional-tool-name"}]}',
  ].join("\n");
}

function buildToolSummaries(tools: McpToolForPlanning[], allowedToolNames: string[]): Array<Record<string, unknown>> {
  const allowed = new Set(allowedToolNames);
  return tools
    .filter((tool) => allowed.has(tool.name))
    .map((tool) => ({
      name: tool.name,
      description: tool.description?.slice(0, 280),
      required: tool.inputSchema?.required ?? [],
      properties: Object.keys(tool.inputSchema?.properties ?? {}).slice(0, 20),
    }));
}
