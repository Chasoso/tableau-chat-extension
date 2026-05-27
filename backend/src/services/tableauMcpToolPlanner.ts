import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { getConfig } from "../config";
import { logError, logInfo, logWarn, safeErrorDetails } from "../logging";
import type { DashboardContext } from "../types/tableau";

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
  reason?: string;
};

export type McpToolPlan = {
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

    const allowedToolNames = resolveAllowedToolNames(input.tools, input.allowedToolNames);
    const prompt = buildPlannerPrompt({
      ...input,
      allowedToolNames,
    });

    try {
      logInfo("tableau.mcp.tool_planner.started", {
        modelId: config.model.bedrock.modelId,
        maxToolCalls: input.maxToolCalls,
        availableToolCount: input.tools.length,
        allowedToolCount: allowedToolNames.length,
        observationCount: input.observations?.length ?? 0,
        promptLength: prompt.length,
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
      const plan = parseToolPlanResponse(text);

      if (!plan?.toolCalls.length) {
        logWarn("tableau.mcp.tool_planner.empty_plan", {
          responseLength: text.length,
        });
        return undefined;
      }

      logInfo("tableau.mcp.tool_planner.completed", {
        plannedToolCount: plan.toolCalls.length,
        plannedTools: plan.toolCalls.map((call) => call.toolName),
      });
      return plan;
    } catch (error) {
      logError("tableau.mcp.tool_planner.failed", safeErrorDetails(error));
      return undefined;
    }
  }
}

export function parseToolPlanResponse(text: string): McpToolPlan | undefined {
  const jsonText = extractJsonObject(text);
  if (!jsonText) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(jsonText) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return undefined;
    }

    const toolCalls = (parsed as { toolCalls?: unknown }).toolCalls;
    if (!Array.isArray(toolCalls)) {
      return undefined;
    }

    const normalized = toolCalls
      .map(normalizeToolCall)
      .filter((call): call is PlannedMcpToolCall => Boolean(call));

    return { toolCalls: normalized };
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
  const reason = typeof record.reason === "string" ? record.reason.slice(0, 240) : undefined;

  return {
    toolName: toolName.trim(),
    ...(args ? { arguments: args } : {}),
    ...(reason ? { reason } : {}),
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

function buildPlannerPrompt(input: McpToolPlannerInput & { allowedToolNames: string[] }): string {
  return [
    "You are a planner for Tableau MCP tool calls.",
    "Return only JSON. Do not include markdown.",
    "Choose the smallest useful set of tools for answering the user's question.",
    "Prefer datasource/metadata/query tools when the user asks about values, rankings, trends, monthly counts, or records shown in the dashboard.",
    "Prefer workbook/view tools when the user asks about dashboard structure, sheets, filters, or workbook metadata.",
    "Never request raw row-level data unless the user explicitly asks for records. Prefer aggregate queries with a small limit.",
    `Maximum tool calls: ${input.maxToolCalls}`,
    `Allowed tools: ${input.allowedToolNames.join(", ") || "none"}`,
    `Previously called tools: ${input.previouslyCalledToolNames?.join(", ") || "none"}`,
    "Available tool summaries:",
    JSON.stringify(buildToolSummaries(input.tools, input.allowedToolNames)),
    "Previous observations:",
    JSON.stringify(
      (input.observations ?? []).map((observation) => ({
        toolName: observation.toolName,
        status: observation.status,
        summary: observation.summary?.slice(0, 1600),
        warning: observation.warning,
      })),
    ),
    "Dashboard context:",
    JSON.stringify({
      dashboardName: input.dashboardContext.dashboardName,
      workbookName: input.dashboardContext.workbookName,
      worksheets: input.dashboardContext.worksheets.map((worksheet) => worksheet.name),
      filters: input.dashboardContext.filters.map((filter) => ({
        worksheetName: filter.worksheetName,
        fieldName: filter.fieldName,
        appliedValues: filter.appliedValues,
      })),
      parameters: input.dashboardContext.parameters.map((parameter) => ({
        name: parameter.name,
        currentValue: parameter.currentValue,
      })),
      dataSources: input.dashboardContext.dataSources?.map((datasource) => ({
        worksheetName: datasource.worksheetName,
        name: datasource.name,
        id: datasource.id,
      })),
    }),
    `User question: ${input.question}`,
    'JSON schema: {"toolCalls":[{"toolName":"list-datasources","arguments":{},"reason":"..."}]}',
  ].join("\n");
}

function buildToolSummaries(tools: McpToolForPlanning[], allowedToolNames: string[]): Array<Record<string, unknown>> {
  const allowed = new Set(allowedToolNames);
  return tools
    .filter((tool) => allowed.has(tool.name))
    .map((tool) => ({
      name: tool.name,
      description: tool.description?.slice(0, 320),
      required: tool.inputSchema?.required ?? [],
      properties: Object.keys(tool.inputSchema?.properties ?? {}).slice(0, 20),
    }));
}
