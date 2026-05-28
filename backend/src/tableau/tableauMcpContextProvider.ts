import { createRequire } from "node:module";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { getTableauConnectedAppSecrets } from "../aws/secrets";
import { getConfig } from "../config";
import { logError, logInfo, logWarn, safeErrorDetails, safeHash } from "../logging";
import {
  classifyQuestionIntent,
  resolveAllowedToolNames,
  TableauMcpToolPlanner,
  type ClassifiedQuestionIntent,
  type PlannedMcpToolCall,
} from "../services/tableauMcpToolPlanner";
import type {
  McpExecutionDebug,
  McpObservation,
  TableauAdditionalContext,
  TableauMcpToolResultSummary,
  TableauMcpToolSummary,
} from "../types/tableau";
import type { GetAdditionalContextInput, TableauContextProvider } from "./contextProvider";

type McpTool = {
  name: string;
  description?: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
};

export type RawMcpToolResult = {
  toolName: string;
  result: unknown;
};

const TOOL_RESULT_SUMMARY_LIMIT = 1_800;
const TOOL_RESULT_PREVIEW_LIMIT = 360;
const TOOL_CACHE_KEY_MAX_LENGTH = 1200;

type CacheEntry = {
  expiresAt: number;
  result: unknown;
};

const metadataToolCache = new Map<string, CacheEntry>();

export class TableauMcpContextProvider implements TableauContextProvider {
  readonly name = "tableau-mcp" as const;

  async getAdditionalContext(input: GetAdditionalContextInput): Promise<TableauAdditionalContext> {
    const config = getConfig();
    const mcpConfig = config.tableau.mcp;

    if (mcpConfig.transport === "http") {
      return callHttpMcpStub(input);
    }

    if (mcpConfig.transport !== "stdio") {
      return {
        provider: this.name,
        warnings: [`Tableau MCP transport '${mcpConfig.transport}' is not supported. Use 'stdio' for the Lambda PoC.`],
      };
    }

    if (!input.tableauSubject) {
      return {
        provider: this.name,
        warnings: ["Tableau MCP lookup skipped because no authenticated Tableau subject was available."],
      };
    }

    let client: Client | undefined;
    let transport: StdioClientTransport | undefined;

    try {
      const connectedApp = await getTableauConnectedAppSecrets();
      const command = resolveMcpCommand(mcpConfig.command);
      const args = resolveMcpArgs(command, mcpConfig.args);
      const env = buildMcpEnvironment({
        tableauSubject: input.tableauSubject,
        connectedApp,
      });

      logInfo("tableau.mcp.stdio.started", {
        commandSource: mcpConfig.command ? "configured" : "package",
        authMode: mcpConfig.authMode,
        tableauSubjectHash: safeHash(input.tableauSubject),
        dashboardName: input.dashboardContext.dashboardName,
        workbookNamePresent: Boolean(input.dashboardContext.workbookName),
      });

      transport = new StdioClientTransport({
        command,
        args,
        env,
        stderr: "pipe",
      });
      transport.stderr?.on("data", () => {
        // Drain stderr so the child process cannot block. Do not log MCP stderr because it may include environment details.
      });
      client = new Client({
        name: "tableau-chat-extension-backend",
        version: "0.1.0",
      });

      await client.connect(transport);
      const toolsResponse = await client.listTools(undefined, { timeout: mcpConfig.timeoutMs });
      const tools = toolsResponse.tools as McpTool[];
      const allowedToolNames = resolveAllowedToolNames(tools, mcpConfig.allowedTools);
      const intent = classifyQuestionIntent(input.question, input.dashboardContext, allowedToolNames);
      const effectiveMaxToolCalls = Math.max(0, Math.min(mcpConfig.maxToolCalls, intent.maxToolCalls));
      const toolSummaries = tools.map(toToolSummary);
      const initialToolSelection = await selectInitialTools(tools, mcpConfig.allowedTools, input, intent, effectiveMaxToolCalls);
      const toolQueue = [...initialToolSelection.selections];
      const toolResults: TableauMcpToolResultSummary[] = [];
      const rawToolResults: RawMcpToolResult[] = [];
      const observations: McpObservation[] = [];
      const calledToolNames = new Set<string>();
      let executedToolCallCount = 0;
      let dataReplanAttempted = false;
      let planningTimeMs = initialToolSelection.planningTimeMs;
      const executionStartedAt = Date.now();
      const blockedToolNames = [...initialToolSelection.blockedTools];
      let fallbackReason: string | undefined;

      logInfo("tableau.mcp.intent.classified", {
        intent: intent.intent,
        confidence: intent.confidence,
        needsMcp: intent.needsMcp,
        answerableFromDashboardContext: intent.answerableFromDashboardContext,
        maxToolCalls: effectiveMaxToolCalls,
      });

      if (!intent.needsMcp || effectiveMaxToolCalls === 0) {
        fallbackReason = "Intent indicates dashboard context is sufficient or question is unsupported.";
      }

      while (intent.needsMcp && executedToolCallCount < effectiveMaxToolCalls) {
        if (!toolQueue.length) {
          if (
            !dataReplanAttempted &&
            shouldReplanForDatasourceQuery(intent, toolResults, calledToolNames) &&
            executedToolCallCount < effectiveMaxToolCalls
          ) {
            dataReplanAttempted = true;
            const replanStartedAt = Date.now();
            const replannedTools = await selectPlannedTools(tools, mcpConfig.allowedTools, input, intent, effectiveMaxToolCalls, {
              observations: toolResults,
              calledToolNames,
            });
            planningTimeMs += Date.now() - replanStartedAt;
            blockedToolNames.push(...replannedTools.blockedTools);
            const readyReplannedTools = replannedTools.selections.filter((selection) => selection.status === "ready");
            if (readyReplannedTools.length) {
              toolQueue.push(...readyReplannedTools);
              continue;
            }
          }

          break;
        }

        const selection = toolQueue.shift();
        if (!selection) {
          break;
        }

        if (selection.status === "skipped") {
          toolResults.push(selection);
          observations.push({
            tool: selection.toolName,
            purpose: "Skipped before execution",
            argsSummary: {},
            success: false,
            resultSummary: "",
            errorMessage: selection.warning,
          });
          continue;
        }

        if (calledToolNames.has(selection.tool.name)) {
          continue;
        }

        const toolStartedAt = Date.now();
        try {
          const execution = await executeToolWithCache({
            client,
            toolName: selection.tool.name,
            args: selection.arguments,
            tableauSubject: input.tableauSubject,
            timeoutMs: mcpConfig.timeoutMs,
          });
          const result = execution.result;
          const resultSummary = summarizeToolResult(result);
          toolResults.push({
            toolName: selection.tool.name,
            status: "success",
            summary: resultSummary,
          });
          rawToolResults.push({
            toolName: selection.tool.name,
            result,
          });
          observations.push({
            tool: selection.tool.name,
            purpose: selection.reason ?? "Collect Tableau Cloud context",
            argsSummary: summarizeToolArguments(selection.arguments),
            success: true,
            resultSummary,
            rawResultPreview: summarizeToolResultPreview(result),
          });
          logMcpToolResultDebug(selection.tool.name, result, mcpConfig.debugLogResults);
          calledToolNames.add(selection.tool.name);
          executedToolCallCount += 1;
          logInfo("tableau.mcp.tool.completed", {
            toolName: selection.tool.name,
            durationMs: Date.now() - toolStartedAt,
            cacheHit: execution.cacheHit,
          });

          const followUp = buildFollowUpToolSelection(selection.tool.name, result, tools, calledToolNames, input);
          if (followUp) {
            toolQueue.unshift(followUp);
          }
        } catch (error) {
          const errorMessage = summarizeErrorMessage(error);
          logWarn("tableau.mcp.tool.failed", {
            toolName: selection.tool.name,
            ...safeErrorDetails(error),
          });
          toolResults.push({
            toolName: selection.tool.name,
            status: "failed",
            warning: errorMessage,
          });
          executedToolCallCount += 1;
          observations.push({
            tool: selection.tool.name,
            purpose: selection.reason ?? "Collect Tableau Cloud context",
            argsSummary: summarizeToolArguments(selection.arguments),
            success: false,
            resultSummary: "",
            errorMessage,
          });
        }
      }

      const executionTimeMs = Date.now() - executionStartedAt;
      logInfo("tableau.mcp.stdio.completed", {
        toolCount: toolSummaries.length,
        calledToolCount: toolResults.filter((result) => result.status === "success").length,
        failedToolCount: toolResults.filter((result) => result.status === "failed").length,
        selectedTools: toolResults.map((result) => result.toolName),
        blockedToolCount: blockedToolNames.length,
        planningTimeMs,
        executionTimeMs,
      });
      const extractedWorkbook = extractWorkbookFromToolResults(toolResults, input);
      const extractedDatasources = extractDatasourcesFromRawToolResults(rawToolResults, input);
      logInfo("tableau.mcp.datasources.extracted", {
        datasourceCount: extractedDatasources.length,
        matchedKnownDatasource: hasDatasourceMatchingDashboardContext(extractedDatasources, input),
      });
      logInfo("tableau.mcp.workbook.extracted", {
        workbookNamePresent: Boolean(extractedWorkbook?.name),
        workbookNameHash: safeHash(extractedWorkbook?.name),
        workbookIdHash: safeHash(extractedWorkbook?.id),
      });

      const executionDebug: McpExecutionDebug = {
        intent: intent.intent,
        intentConfidence: intent.confidence,
        answerableFromDashboardContext: intent.answerableFromDashboardContext,
        needsMcp: intent.needsMcp,
        maxToolCalls: effectiveMaxToolCalls,
        plannerReasonBrief: initialToolSelection.reasonBrief,
        plannedTools: initialToolSelection.plannedTools,
        blockedTools: blockedToolNames,
        executedTools: toolResults.filter((result) => result.status === "success").map((result) => result.toolName),
        skippedTools: toolResults.filter((result) => result.status === "skipped").map((result) => result.toolName),
        toolCallCount: toolResults.filter((result) => result.status === "success").length,
        replanUsed: dataReplanAttempted,
        timingMs: {
          planning: planningTimeMs,
          execution: executionTimeMs,
        },
        ...(fallbackReason ? { fallbackReason } : {}),
      };

      return {
        provider: this.name,
        workbook: extractedWorkbook,
        datasources: extractedDatasources,
        metadata: {
          transport: "stdio",
          toolCount: toolSummaries.length,
          calledTools: toolResults.map((result) => result.toolName),
          workbookExtracted: Boolean(extractedWorkbook),
          toolPlanningEnabled: mcpConfig.toolPlanningEnabled,
          intent: intent.intent,
        },
        mcpTools: toolSummaries,
        mcpToolResults: toolResults,
        mcpObservations: observations,
        mcpExecutionDebug: executionDebug,
        warnings: toolResults
          .filter((result) => result.status === "failed" || result.status === "skipped")
          .map((result) => `${result.toolName}: ${result.warning ?? result.status}`),
      };
    } catch (error) {
      logError("tableau.mcp.lookup.failed", safeErrorDetails(error));
      return {
        provider: this.name,
        warnings: ["Tableau MCP lookup failed. Using dashboard context only."],
      };
    } finally {
      await transport?.close().catch((error) => {
        logWarn("tableau.mcp.transport.close_failed", safeErrorDetails(error));
      });
    }
  }
}

async function callHttpMcpStub(input: GetAdditionalContextInput): Promise<TableauAdditionalContext> {
  const config = getConfig().tableau.mcp;

  if (!config.serverUrl) {
    return {
      provider: "tableau-mcp",
      warnings: ["Tableau MCP server URL is not configured. Using dashboard context only."],
    };
  }

  try {
    const response = await fetch(trimTrailingSlash(config.serverUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        operation: "get_dashboard_context",
        dashboardContext: sanitizeDashboardContext(input.dashboardContext),
        question: input.question,
      }),
      signal: AbortSignal.timeout(config.timeoutMs),
    });

    if (!response.ok) {
      return {
        provider: "tableau-mcp",
        warnings: [`Tableau MCP HTTP lookup failed with status ${response.status}.`],
      };
    }

    const body = (await response.json()) as TableauAdditionalContext;
    return {
      provider: "tableau-mcp",
      workbook: body.workbook,
      datasources: body.datasources ?? [],
      metadata: body.metadata,
      mcpTools: body.mcpTools ?? [],
      mcpToolResults: body.mcpToolResults ?? [],
      mcpObservations: body.mcpObservations ?? [],
      mcpExecutionDebug: body.mcpExecutionDebug,
      warnings: body.warnings ?? [],
    };
  } catch {
    return {
      provider: "tableau-mcp",
      warnings: ["Tableau MCP HTTP lookup failed. Using dashboard context only."],
    };
  }
}

function resolveMcpCommand(configuredCommand: string): string {
  if (configuredCommand) {
    return configuredCommand;
  }

  return process.execPath;
}

function resolveMcpArgs(command: string, configuredArgs: string[]): string[] {
  if (configuredArgs.length) {
    return configuredArgs;
  }

  if (command !== process.execPath) {
    return [];
  }

  const requireFromRuntime = createRequire(__filename);
  return [requireFromRuntime.resolve("@tableau/mcp-server")];
}

function buildMcpEnvironment(input: {
  tableauSubject: string;
  connectedApp: { clientId: string; secretId: string; secretValue: string };
}): Record<string, string> {
  const config = getConfig();

  return compactEnv({
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: "production",
    SERVER: config.tableau.serverUrl,
    SITE_NAME: config.tableau.siteContentUrl,
    TRANSPORT: "stdio",
    AUTH: config.tableau.mcp.authMode || "direct-trust",
    JWT_SUB_CLAIM: input.tableauSubject,
    CONNECTED_APP_CLIENT_ID: input.connectedApp.clientId,
    CONNECTED_APP_SECRET_ID: input.connectedApp.secretId,
    CONNECTED_APP_SECRET_VALUE: input.connectedApp.secretValue,
    DISABLE_LOG_MASKING: "false",
    PRODUCT_TELEMETRY_ENABLED: "false",
    TELEMETRY_PROVIDER: "noop",
  });
}

function compactEnv(values: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).filter((entry): entry is [string, string] => Boolean(entry[1])));
}

type SelectedTool =
  | {
      status: "ready";
      tool: McpTool;
      arguments: Record<string, unknown>;
      reason?: string;
    }
  | {
      status: "skipped";
      toolName: string;
      warning: string;
    };

async function selectInitialTools(
  tools: McpTool[],
  allowedTools: string[],
  input: GetAdditionalContextInput,
  intent: ClassifiedQuestionIntent,
  maxToolCalls: number,
): Promise<{
  selections: SelectedTool[];
  blockedTools: string[];
  plannedTools: string[];
  reasonBrief?: string;
  planningTimeMs: number;
}> {
  const plannerStartedAt = Date.now();
  const plannedSelections = await selectPlannedTools(tools, allowedTools, input, intent, maxToolCalls);
  const planningTimeMs = Date.now() - plannerStartedAt;
  if (plannedSelections.selections.some((selection) => selection.status === "ready")) {
    return {
      ...plannedSelections,
      planningTimeMs,
    };
  }

  const candidates = allowedTools.length ? tools.filter((tool) => allowedTools.includes(tool.name)) : getDefaultToolCandidates(tools, input);

  logInfo("tableau.mcp.tools.selected", {
    availableToolCount: tools.length,
    selectedTools: candidates.map((tool) => tool.name),
    allowedToolsConfigured: allowedTools.length > 0,
  });

  return {
    selections: candidates.map((tool) => {
      const args = inferToolArguments(tool, input);
      if (!args) {
        return {
          status: "skipped",
          toolName: tool.name,
          warning: "Required arguments could not be inferred safely.",
        };
      }

      return {
        status: "ready",
        tool,
        arguments: args,
      };
    }),
    blockedTools: [],
    plannedTools: candidates.map((tool) => tool.name),
    reasonBrief: "Fallback tool selection without LLM planning.",
    planningTimeMs,
  };
}

async function selectPlannedTools(
  tools: McpTool[],
  allowedTools: string[],
  input: GetAdditionalContextInput,
  intent: ClassifiedQuestionIntent,
  maxToolCalls: number,
  options: {
    observations?: TableauMcpToolResultSummary[];
    calledToolNames?: Set<string>;
  } = {},
): Promise<{
  selections: SelectedTool[];
  blockedTools: string[];
  plannedTools: string[];
  reasonBrief?: string;
}> {
  const config = getConfig();
  if (!config.tableau.mcp.toolPlanningEnabled || maxToolCalls <= 0) {
    return { selections: [], blockedTools: [], plannedTools: [] };
  }

  const planner = new TableauMcpToolPlanner();
  const allowedToolNames = resolveAllowedToolNames(tools, allowedTools);
  const plan = await planner.plan({
    question: input.question,
    dashboardContext: input.dashboardContext,
    tools,
    maxToolCalls,
    allowedToolNames,
    observations: options.observations,
    previouslyCalledToolNames: [...(options.calledToolNames ?? [])],
    intentHint: intent,
  });

  if (!plan?.toolCalls.length) {
    return {
      selections: [],
      blockedTools: [],
      plannedTools: [],
      reasonBrief: plan?.reasonBrief ?? intent.reasonBrief,
    };
  }

  const blockedTools: string[] = [];
  const plannedTools = plan.toolCalls.map((call) => call.toolName);
  const selections = plan.toolCalls.map((call) =>
    buildSelectionFromPlannedCall(call, tools, allowedToolNames, input, options.calledToolNames ?? new Set<string>(), blockedTools),
  );
  logInfo("tableau.mcp.tools.planned", {
    availableToolCount: tools.length,
    selectedTools: selections.map(getSelectionToolName),
    allowedToolsConfigured: allowedTools.length > 0,
    readyToolCount: selections.filter((selection) => selection.status === "ready").length,
    skippedToolCount: selections.filter((selection) => selection.status === "skipped").length,
    blockedTools,
    intent: plan.intent,
    reasonBrief: plan.reasonBrief,
  });

  return {
    selections,
    blockedTools,
    plannedTools,
    reasonBrief: plan.reasonBrief,
  };
}

function buildSelectionFromPlannedCall(
  call: PlannedMcpToolCall,
  tools: McpTool[],
  allowedToolNames: string[],
  input: GetAdditionalContextInput,
  calledToolNames: Set<string>,
  blockedTools: string[],
): SelectedTool {
  const tool = tools.find((candidate) => candidate.name === call.toolName);
  if (!tool) {
    blockedTools.push(call.toolName);
    return {
      status: "skipped",
      toolName: call.toolName,
      warning: "Planned tool is not available from the MCP server.",
    };
  }

  if (!allowedToolNames.includes(tool.name)) {
    blockedTools.push(tool.name);
    return {
      status: "skipped",
      toolName: tool.name,
      warning: "Planned tool is not allowlisted.",
    };
  }

  if (calledToolNames.has(tool.name)) {
    return {
      status: "skipped",
      toolName: tool.name,
      warning: "Planned tool was already called.",
    };
  }

  const args = inferPlannedToolArguments(tool, call.arguments, input);
  if (!args) {
    blockedTools.push(tool.name);
    return {
      status: "skipped",
      toolName: tool.name,
      warning: "Planned tool arguments could not be validated safely.",
    };
  }

  return {
    status: "ready",
    tool,
    arguments: args,
    reason: call.purpose ?? call.reason,
  };
}

function getSelectionToolName(selection: SelectedTool): string {
  return selection.status === "ready" ? selection.tool.name : selection.toolName;
}

function inferPlannedToolArguments(
  tool: McpTool,
  plannedArguments: Record<string, unknown> | undefined,
  input: GetAdditionalContextInput,
): Record<string, unknown> | undefined {
  const knownArguments = inferKnownToolArguments(tool.name, input);
  const merged = {
    ...(knownArguments ?? {}),
    ...(plannedArguments ?? {}),
  };

  if (tool.name === "query-datasource") {
    return validateQueryDatasourceArguments(merged, input);
  }

  const required = tool.inputSchema?.required ?? [];
  for (const propertyName of required) {
    if (merged[propertyName] === undefined || merged[propertyName] === null || merged[propertyName] === "") {
      const inferred = inferValueForProperty(propertyName, input);
      if (inferred === undefined) {
        return undefined;
      }

      merged[propertyName] = inferred;
    }
  }

  return validateArgumentsAgainstSchema(merged, tool.inputSchema?.properties ?? {});
}

function validateArgumentsAgainstSchema(
  args: Record<string, unknown>,
  properties: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const validKeys = Object.keys(properties);
  if (!validKeys.length) {
    return args;
  }

  const sanitized = Object.fromEntries(
    Object.entries(args).filter(([key, value]) => validKeys.includes(key) && isSafeToolArgumentValue(value, 0)),
  );
  return sanitized;
}

function validateQueryDatasourceArguments(
  args: Record<string, unknown>,
  input: GetAdditionalContextInput,
): Record<string, unknown> | undefined {
  const config = getConfig().tableau.mcp;
  const datasourceLuid = readString(args.datasourceLuid) ?? readString(args.datasourceId);
  const query = args.query;
  if (!datasourceLuid || !query || typeof query !== "object" || Array.isArray(query)) {
    return undefined;
  }

  const knownDatasourceIds = new Set(
    input.dashboardContext.dataSources?.map((datasource) => datasource.id).filter((id): id is string => Boolean(id)) ?? [],
  );
  if (knownDatasourceIds.size > 0 && !knownDatasourceIds.has(datasourceLuid)) {
    return undefined;
  }

  const queryRecord = query as Record<string, unknown>;
  const fields = Array.isArray(queryRecord.fields) ? queryRecord.fields : undefined;
  if (!fields || fields.length === 0 || fields.length > Math.max(config.queryDatasourceMaxFields, 1)) {
    return undefined;
  }

  if (!containsAggregateField(fields)) {
    return undefined;
  }

  if (containsSensitiveFieldName(fields) || containsSensitiveFieldNameFromFilters(queryRecord.filters)) {
    return undefined;
  }

  const limit = typeof args.limit === "number" ? Math.floor(args.limit) : Math.floor(config.queryDatasourceMaxLimit);
  if (!Number.isFinite(limit) || limit <= 0) {
    return undefined;
  }

  return {
    datasourceLuid,
    query: queryRecord,
    limit: Math.min(limit, config.queryDatasourceMaxLimit),
  };
}

function containsAggregateField(fields: unknown[]): boolean {
  return fields.some((field) => {
    if (!field || typeof field !== "object" || Array.isArray(field)) {
      return false;
    }

    const fn = readString((field as Record<string, unknown>).function)?.toUpperCase();
    if (!fn) {
      return false;
    }

    return [
      "SUM",
      "AVG",
      "MEDIAN",
      "COUNT",
      "COUNTD",
      "MIN",
      "MAX",
      "STDEV",
      "VAR",
      "YEAR",
      "QUARTER",
      "MONTH",
      "WEEK",
      "DAY",
      "TRUNC_YEAR",
      "TRUNC_QUARTER",
      "TRUNC_MONTH",
      "TRUNC_WEEK",
      "TRUNC_DAY",
      "AGG",
    ].includes(fn);
  });
}

function containsSensitiveFieldName(fields: unknown[]): boolean {
  const sensitivePattern = /(email|e-mail|phone|tel|mobile|address|ssn|social|credit|card|token|secret|password|cookie|auth|user\s?id|employee\s?id)/i;
  return fields.some((field) => {
    if (!field || typeof field !== "object" || Array.isArray(field)) {
      return false;
    }

    const caption = readString((field as Record<string, unknown>).fieldCaption);
    return Boolean(caption && sensitivePattern.test(caption));
  });
}

function containsSensitiveFieldNameFromFilters(filters: unknown): boolean {
  if (!Array.isArray(filters)) {
    return false;
  }

  const sensitivePattern = /(email|phone|address|ssn|credit|card|token|secret|password|cookie|auth)/i;
  return filters.some((filter) => {
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      return false;
    }

    const field = (filter as Record<string, unknown>).field;
    if (!field || typeof field !== "object" || Array.isArray(field)) {
      return false;
    }

    const caption = readString((field as Record<string, unknown>).fieldCaption);
    return Boolean(caption && sensitivePattern.test(caption));
  });
}

function isSafeToolArgumentValue(value: unknown, depth: number): boolean {
  if (depth > 5) {
    return false;
  }

  if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.length <= 50 && value.every((item) => isSafeToolArgumentValue(item, depth + 1));
  }

  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).every((item) => isSafeToolArgumentValue(item, depth + 1));
  }

  return false;
}

function getDefaultToolCandidates(tools: McpTool[], input: GetAdditionalContextInput): McpTool[] {
  const preferredNames = isDatasourceAnalysisQuestion(input.question)
    ? ["list-datasources", "get-datasource-metadata"]
    : input.dashboardContext.workbookName
      ? ["list-workbooks", "get-workbook", "list-views", "list-datasources", "search-content"]
      : ["list-views", "search-content", "list-workbooks", "list-datasources"];
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const preferred = preferredNames.flatMap((name) => {
    const tool = byName.get(name);
    return tool ? [tool] : [];
  });

  if (preferred.length) {
    return preferred;
  }

  return tools
    .filter((tool) => /list.*workbook|list.*view|list.*datasource|get.*datasource.*metadata|search.*content/i.test(tool.name))
    .sort((left, right) => getToolPriority(left.name) - getToolPriority(right.name));
}

function getToolPriority(toolName: string): number {
  if (toolName === "list-workbooks") {
    return 10;
  }
  if (toolName === "get-workbook") {
    return 20;
  }
  if (toolName === "list-views") {
    return 30;
  }
  if (toolName === "list-datasources") {
    return 40;
  }
  if (toolName === "get-datasource-metadata") {
    return 45;
  }
  if (toolName === "search-content") {
    return 50;
  }
  return 100;
}

function shouldReplanForDatasourceQuery(
  intent: ClassifiedQuestionIntent,
  toolResults: TableauMcpToolResultSummary[],
  calledToolNames: Set<string>,
): boolean {
  if (!getConfig().tableau.mcp.toolPlanningEnabled || calledToolNames.has("query-datasource")) {
    return false;
  }

  if (intent.intent !== "data_analysis") {
    return false;
  }

  return toolResults.some(
    (result) => result.status === "success" && ["list-datasources", "get-datasource-metadata"].includes(result.toolName),
  );
}

function isDataQuestion(question: string): boolean {
  return /view|views|count|sum|average|avg|rank|ranking|top|bottom|trend|month|week|day|date|record|row|data|datasource|データ|集計|ランキング|推移|日|週|月/i.test(
    question,
  );
}

function isDatasourceAnalysisQuestion(question: string): boolean {
  return (
    isDataQuestion(question) ||
    /metadata|field|schema|column|datasource|フィールド|データソース|メタデータ|列|項目|値|傾向/i.test(question)
  );
}

async function executeToolWithCache(input: {
  client: Client;
  toolName: string;
  args: Record<string, unknown>;
  tableauSubject: string | undefined;
  timeoutMs: number;
}): Promise<{ result: unknown; cacheHit: boolean }> {
  const config = getConfig().tableau.mcp;
  if (!config.metadataCacheEnabled || !isCacheableToolName(input.toolName)) {
    const result = await input.client.callTool(
      {
        name: input.toolName,
        arguments: input.args,
      },
      undefined,
      { timeout: input.timeoutMs },
    );
    return { result, cacheHit: false };
  }

  pruneMetadataToolCache();
  const cacheKey = buildCacheKey(input.tableauSubject, input.toolName, input.args);
  const cached = metadataToolCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { result: cached.result, cacheHit: true };
  }

  const result = await input.client.callTool(
    {
      name: input.toolName,
      arguments: input.args,
    },
    undefined,
    { timeout: input.timeoutMs },
  );
  metadataToolCache.set(cacheKey, {
    result,
    expiresAt: Date.now() + Math.max(config.metadataCacheTtlMs, 1000),
  });
  return { result, cacheHit: false };
}

function isCacheableToolName(toolName: string): boolean {
  return ["list-workbooks", "get-workbook", "list-views", "list-datasources", "get-datasource-metadata"].includes(toolName);
}

function pruneMetadataToolCache(): void {
  const now = Date.now();
  for (const [key, entry] of metadataToolCache.entries()) {
    if (entry.expiresAt <= now) {
      metadataToolCache.delete(key);
    }
  }
}

function buildCacheKey(subject: string | undefined, toolName: string, args: Record<string, unknown>): string {
  const raw = `${subject ?? "anonymous"}|${toolName}|${stableStringify(args)}`;
  return raw.length > TOOL_CACHE_KEY_MAX_LENGTH ? raw.slice(0, TOOL_CACHE_KEY_MAX_LENGTH) : raw;
}

function stableStringify(value: unknown): string {
  if (!value || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

function summarizeToolArguments(args: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(args)
      .slice(0, 12)
      .map(([key, value]) => {
        if (typeof value === "string") {
          return [key, value.slice(0, 120)];
        }

        if (typeof value === "number" || typeof value === "boolean" || value === null) {
          return [key, value];
        }

        if (Array.isArray(value)) {
          return [key, `array(${value.length})`];
        }

        if (value && typeof value === "object") {
          return [key, `object(${Object.keys(value as Record<string, unknown>).length})`];
        }

        return [key, String(value)];
      }),
  );
}

function summarizeToolResultPreview(result: unknown): string {
  const text = extractTextFromToolResult(result) || JSON.stringify(describeValueShape(result));
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > TOOL_RESULT_PREVIEW_LIMIT ? `${compact.slice(0, TOOL_RESULT_PREVIEW_LIMIT)}...` : compact;
}

function summarizeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Tool call failed.";
  }

  return error.message?.slice(0, 220) || "Tool call failed.";
}
function buildFollowUpToolSelection(
  completedToolName: string,
  result: unknown,
  tools: McpTool[],
  calledToolNames: Set<string>,
  input: GetAdditionalContextInput,
): SelectedTool | undefined {
  if (completedToolName === "list-datasources" && !calledToolNames.has("get-datasource-metadata")) {
    const getDatasourceMetadataTool = tools.find((tool) => tool.name === "get-datasource-metadata");
    const datasourceLuid = extractBestDatasourceId(result, input);
    if (getDatasourceMetadataTool && datasourceLuid) {
      const args = inferPlannedToolArguments(getDatasourceMetadataTool, { datasourceLuid }, input);
      if (args) {
        return {
          status: "ready",
          tool: getDatasourceMetadataTool,
          arguments: args,
          reason: "Inspect datasource fields before deciding whether an aggregate query is safe.",
        };
      }
    }
  }

  if (!["list-workbooks", "list-views", "search-content"].includes(completedToolName) || calledToolNames.has("get-workbook")) {
    return undefined;
  }

  const getWorkbookTool = tools.find((tool) => tool.name === "get-workbook");
  if (!getWorkbookTool) {
    return undefined;
  }

  const workbookId = extractBestWorkbookId(result, input.dashboardContext.workbookName ?? input.dashboardContext.dashboardName);
  if (!workbookId) {
    return undefined;
  }

  return {
    status: "ready",
    tool: getWorkbookTool,
    arguments: { workbookId },
  };
}

function extractBestDatasourceId(result: unknown, input: GetAdditionalContextInput): string | undefined {
  const text = extractTextFromToolResult(result);
  const parsed = tryParseJson(text) ?? result;
  const datasourceCandidates = findDataSourceObjects(parsed).flatMap((datasource) => {
    if (!datasource || typeof datasource !== "object") {
      return [];
    }

    const record = datasource as Record<string, unknown>;
    const name = readString(record.name);
    const id = readString(record.id) ?? readString(record.luid);
    return id ? [{ id, name }] : [];
  });

  if (!datasourceCandidates.length) {
    return input.dashboardContext.dataSources?.find((datasource) => datasource.id)?.id ?? undefined;
  }

  const knownDatasourceNames = new Set(
    input.dashboardContext.dataSources?.map((datasource) => datasource.name.trim().toLowerCase()).filter(Boolean) ?? [],
  );
  const matched = datasourceCandidates.find((candidate) => candidate.name && knownDatasourceNames.has(candidate.name.trim().toLowerCase()));
  return matched?.id ?? datasourceCandidates[0]?.id;
}

function inferToolArguments(tool: McpTool, input: GetAdditionalContextInput): Record<string, unknown> | undefined {
  const knownArguments = inferKnownToolArguments(tool.name, input);
  if (knownArguments) {
    return knownArguments;
  }

  const required = tool.inputSchema?.required ?? [];
  const properties = tool.inputSchema?.properties ?? {};
  const args: Record<string, unknown> = {};

  for (const propertyName of required) {
    const value = inferValueForProperty(propertyName, input);
    if (value === undefined) {
      return undefined;
    }

    args[propertyName] = value;
  }

  if (!required.length) {
    return {};
  }

  for (const propertyName of Object.keys(properties)) {
    if (propertyName in args) {
      continue;
    }

    const value = inferValueForProperty(propertyName, input);
    if (value !== undefined) {
      args[propertyName] = value;
    }
  }

  return args;
}

function inferKnownToolArguments(toolName: string, input: GetAdditionalContextInput): Record<string, unknown> | undefined {
  const dashboardName = input.dashboardContext.dashboardName;
  const workbookName = input.dashboardContext.workbookName ?? undefined;

  switch (toolName) {
    case "list-workbooks":
      return workbookName ? { filter: `name:eq:${escapeFilterValue(workbookName)}`, limit: 10 } : { limit: 25 };
    case "list-views":
      return workbookName
        ? { filter: `workbookName:eq:${escapeFilterValue(workbookName)}`, limit: 25 }
        : { filter: `name:eq:${escapeFilterValue(dashboardName)}`, limit: 25 };
    case "list-datasources": {
      const datasourceName = chooseKnownDatasourceName(input);
      return datasourceName ? { filter: `name:eq:${escapeFilterValue(datasourceName)}`, limit: 10 } : { limit: 100 };
    }
    case "search-content":
      return {
        terms: workbookName ?? dashboardName,
        filter: { contentTypes: ["workbook", "view", "datasource"] },
        limit: 10,
      };
    default:
      return undefined;
  }
}

function inferValueForProperty(propertyName: string, input: GetAdditionalContextInput): unknown {
  const normalized = propertyName.toLowerCase();

  if (normalized.includes("workbook") && normalized.includes("name")) {
    return input.dashboardContext.workbookName;
  }

  if (normalized.includes("dashboard") && normalized.includes("name")) {
    return input.dashboardContext.dashboardName;
  }

  if ((normalized.includes("view") || normalized.includes("sheet")) && normalized.includes("name")) {
    return input.dashboardContext.worksheets[0]?.name ?? input.dashboardContext.dashboardName;
  }

  if (normalized === "query" || normalized.includes("search")) {
    return input.dashboardContext.workbookName ?? input.dashboardContext.dashboardName;
  }

  if (normalized === "limit" || normalized === "pageSize".toLowerCase()) {
    return 10;
  }

  return undefined;
}

function chooseKnownDatasourceName(input: GetAdditionalContextInput): string | undefined {
  const datasourceNames =
    input.dashboardContext.dataSources
      ?.map((datasource) => datasource.name.trim())
      .filter(Boolean) ?? [];

  if (!datasourceNames.length) {
    return undefined;
  }

  const normalizedQuestion = input.question.toLowerCase();
  return (
    datasourceNames.find((name) => normalizedQuestion.includes(name.toLowerCase())) ??
    (datasourceNames.length === 1 ? datasourceNames[0] : undefined)
  );
}

function toToolSummary(tool: McpTool): TableauMcpToolSummary {
  return {
    name: tool.name,
    description: tool.description?.slice(0, 240),
  };
}

function logMcpToolResultDebug(toolName: string, result: unknown, enabled: boolean): void {
  if (!enabled) {
    return;
  }

  const text = extractTextFromToolResult(result);
  const parsed = tryParseJson(text);
  const record = parsed ?? result;
  logInfo("tableau.mcp.tool.result_debug", {
    toolName,
    resultShape: describeValueShape(record),
    textLength: text.length,
    textHash: safeHash(text),
  });
}

function describeValueShape(value: unknown): unknown {
  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      first: describeValueShape(value[0]),
    };
  }

  if (!value || typeof value !== "object") {
    return { type: typeof value };
  }

  const record = value as Record<string, unknown>;
  return {
    type: "object",
    keys: Object.keys(record).slice(0, 30),
    childShapes: Object.fromEntries(
      Object.entries(record)
        .slice(0, 10)
        .map(([key, child]) => [key, Array.isArray(child) ? `array(${child.length})` : typeof child]),
    ),
  };
}

function summarizeToolResult(result: unknown): string {
  const text = (extractTextFromToolResult(result) || JSON.stringify(describeValueShape(result))).replace(/\s+/g, " ").trim();
  return text.length > TOOL_RESULT_SUMMARY_LIMIT ? `${text.slice(0, TOOL_RESULT_SUMMARY_LIMIT)}...` : text;
}

function extractTextFromToolResult(result: unknown): string {
  if (!result || typeof result !== "object") {
    return "";
  }

  const record = result as Record<string, unknown>;
  if (Array.isArray(record.content)) {
    return record.content
      .map((content) => {
        if (!content || typeof content !== "object") {
          return "";
        }

        const contentRecord = content as Record<string, unknown>;
        return typeof contentRecord.text === "string" ? contentRecord.text : "";
      })
      .filter(Boolean)
      .join("\n");
  }

  return "";
}

export function extractBestWorkbookId(result: unknown, preferredName: string | undefined): string | undefined {
  const text = extractTextFromToolResult(result);
  const parsed = tryParseJson(text) ?? result;
  const workbookIdFromView = findWorkbookIdFromViewRecords(parsed, preferredName);
  if (workbookIdFromView) {
    return workbookIdFromView;
  }

  const workbookCandidate = findWorkbookCandidates(parsed, { preferredWorkbookName: preferredName })[0];
  if (workbookCandidate?.id) {
    return workbookCandidate.id;
  }

  const candidates = findObjectsWithId(parsed);
  const normalizedPreferredName = preferredName?.trim().toLowerCase();
  const matched = normalizedPreferredName
    ? candidates.find((candidate) => candidate.name?.trim().toLowerCase() === normalizedPreferredName)
    : undefined;
  return matched?.id ?? candidates[0]?.id ?? findFirstUuid(text);
}

export function extractWorkbookFromToolResults(
  toolResults: TableauMcpToolResultSummary[],
  input: GetAdditionalContextInput,
): { id?: string; name: string } | undefined {
  const preferredWorkbookName = input.dashboardContext.workbookName ?? undefined;
  const parsedResults = toolResults
    .filter((result) => result.status === "success" && result.summary)
    .map((result) => tryParseJson(result.summary ?? "") ?? result.summary);

  const candidates = parsedResults.flatMap((result) =>
    findWorkbookCandidates(result, {
      preferredWorkbookName,
      dashboardName: input.dashboardContext.dashboardName,
      worksheetNames: input.dashboardContext.worksheets.map((worksheet) => worksheet.name),
    }),
  );
  const exactName = preferredWorkbookName?.trim().toLowerCase();
  const exact = exactName ? candidates.find((candidate) => candidate.name.trim().toLowerCase() === exactName) : undefined;
  const fromView = candidates.find((candidate) => candidate.source === "view-workbook");
  const selected = exact ?? fromView ?? candidates.find((candidate) => candidate.source === "workbook") ?? candidates[0];

  logInfo("tableau.mcp.workbook.candidates", {
    candidateCount: candidates.length,
    selectedSource: selected?.source,
    selectedNameHash: safeHash(selected?.name),
    dashboardNameHash: safeHash(input.dashboardContext.dashboardName),
  });

  return selected ? { id: selected.id, name: selected.name } : undefined;
}

export function extractDatasourcesFromRawToolResults(
  rawToolResults: RawMcpToolResult[],
  input: GetAdditionalContextInput,
): unknown[] {
  const parsedDatasourceResults = rawToolResults
    .filter((result) => result.toolName === "list-datasources")
    .flatMap((result) => parseToolResultPayloads(result.result));
  const structuredDatasources = parsedDatasourceResults.flatMap(findDataSourceObjects).map(normalizeDatasourceObject).filter(Boolean);
  const uniqueDatasources = dedupeDatasourceObjects(structuredDatasources);
  const knownNames = getKnownDatasourceNames(input);

  if (!knownNames.size) {
    return uniqueDatasources;
  }

  const matchingDatasources = uniqueDatasources.filter((datasource) => {
    const name = readString((datasource as Record<string, unknown>).name);
    return Boolean(name && knownNames.has(name.trim().toLowerCase()));
  });

  return matchingDatasources.length ? matchingDatasources : uniqueDatasources;
}

type WorkbookCandidate = {
  id?: string;
  name: string;
  source: "workbook" | "view-workbook" | "workbookName" | "parentWorkbookName";
};

type WorkbookCandidateOptions = {
  preferredWorkbookName?: string;
  dashboardName?: string;
  worksheetNames?: string[];
};

function findWorkbookCandidates(value: unknown, options: WorkbookCandidateOptions = {}): WorkbookCandidate[] {
  if (!value) {
    return [];
  }

  if (typeof value === "string") {
    return findWorkbookCandidatesInText(value, options);
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => findWorkbookCandidates(item, options));
  }

  if (typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown>;
  const candidates: WorkbookCandidate[] = [];
  const workbook = record.workbook;
  if (workbook && typeof workbook === "object") {
    const workbookRecord = workbook as Record<string, unknown>;
    const name = readString(workbookRecord.name) ?? readString(workbookRecord.workbookName);
    if (name) {
      candidates.push({
        id: readString(workbookRecord.id),
        name,
        source: "view-workbook",
      });
    }
  }

  const workbookName = readString(record.workbookName);
  if (workbookName) {
    candidates.push({
      id: readString(record.workbookId),
      name: workbookName,
      source: "workbookName",
    });
  }

  const parentWorkbookName = readString(record.parentWorkbookName);
  if (parentWorkbookName) {
    candidates.push({
      id: readString(record.parentWorkbookId) ?? readString(record.workbookId),
      name: parentWorkbookName,
      source: "parentWorkbookName",
    });
  }

  if (looksLikeWorkbookRecord(record)) {
    const name = readString(record.name);
    if (name) {
      candidates.push({
        id: readString(record.id),
        name,
        source: "workbook",
      });
    }
  }

  return [...candidates, ...Object.values(record).flatMap((item) => findWorkbookCandidates(item, options))]
    .filter((candidate) => !isKnownNonWorkbookName(candidate.name, options));
}

function findWorkbookIdFromViewRecords(value: unknown, preferredViewName: string | undefined): string | undefined {
  const candidates = findWorkbookIdCandidatesFromViewRecords(value, preferredViewName);
  return candidates.find((candidate) => candidate.matchedPreferredView)?.id ?? candidates[0]?.id;
}

function findWorkbookIdCandidatesFromViewRecords(
  value: unknown,
  preferredViewName: string | undefined,
): Array<{ id: string; matchedPreferredView: boolean }> {
  if (!value || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => findWorkbookIdCandidatesFromViewRecords(item, preferredViewName));
  }

  const record = value as Record<string, unknown>;
  const workbook = record.workbook;
  const direct =
    workbook && typeof workbook === "object"
      ? [
          {
            id: readString((workbook as Record<string, unknown>).id),
            matchedPreferredView: matchesPreferredViewName(record, preferredViewName),
          },
        ].filter((candidate): candidate is { id: string; matchedPreferredView: boolean } => Boolean(candidate.id))
      : [];

  return [...direct, ...Object.values(record).flatMap((item) => findWorkbookIdCandidatesFromViewRecords(item, preferredViewName))];
}

function matchesPreferredViewName(record: Record<string, unknown>, preferredViewName: string | undefined): boolean {
  if (!preferredViewName) {
    return false;
  }

  const normalizedPreferred = preferredViewName.trim().toLowerCase();
  return [record.name, record.title].some((value) => readString(value)?.trim().toLowerCase() === normalizedPreferred);
}

function findWorkbookCandidatesInText(text: string, options: WorkbookCandidateOptions): WorkbookCandidate[] {
  const candidates: WorkbookCandidate[] = [];
  const workbookLine = text.match(/workbook(?:Name)?["'\s:=]+([^\n",}]+)/i);
  if (workbookLine?.[1]) {
    candidates.push({ name: workbookLine[1].trim(), source: "workbookName" });
  }

  if (options.preferredWorkbookName && text.includes(options.preferredWorkbookName)) {
    candidates.push({ name: options.preferredWorkbookName, source: "workbookName" });
  }

  return candidates.filter((candidate) => !isKnownNonWorkbookName(candidate.name, options));
}

function isKnownNonWorkbookName(name: string, options: WorkbookCandidateOptions): boolean {
  const normalizedName = name.trim().toLowerCase();
  if (!normalizedName) {
    return true;
  }

  const knownNonWorkbookNames = [options.dashboardName, ...(options.worksheetNames ?? [])]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trim().toLowerCase());

  return knownNonWorkbookNames.includes(normalizedName) && normalizedName !== options.preferredWorkbookName?.trim().toLowerCase();
}

function looksLikeWorkbookRecord(record: Record<string, unknown>): boolean {
  return (
    typeof record.name === "string" &&
    (Array.isArray(record.views) ||
      Boolean(record.project) ||
      typeof record.contentUrl === "string" ||
      typeof record.sheetCount === "number" ||
      typeof record.displayTabs === "boolean")
  );
}

function findDataSourceObjects(value: unknown): unknown[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(findDataSourceObjects);
  }

  const record = value as Record<string, unknown>;
  const direct = looksLikeDatasourceRecord(record) ? [record] : [];
  return [...direct, ...Object.values(record).flatMap(findDataSourceObjects)];
}

function parseToolResultPayloads(result: unknown): unknown[] {
  const text = extractTextFromToolResult(result);
  const parsedText = tryParseJson(text);
  if (parsedText !== undefined) {
    return [parsedText];
  }

  return [result];
}

function looksLikeDatasourceRecord(record: Record<string, unknown>): boolean {
  return (
    typeof record.name === "string" &&
    (typeof record.id === "string" || typeof record.luid === "string") &&
    (Boolean(record.project) ||
      Boolean(record.tags) ||
      typeof record.contentUrl === "string" ||
      typeof record.description === "string" ||
      typeof record.webpageUrl === "string")
  );
}

function normalizeDatasourceObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const id = readString(record.id) ?? readString(record.luid);
  const name = readString(record.name);
  if (!id || !name) {
    return undefined;
  }

  const project =
    record.project && typeof record.project === "object"
      ? {
          id: readString((record.project as Record<string, unknown>).id),
          name: readString((record.project as Record<string, unknown>).name),
        }
      : undefined;

  return {
    id,
    name,
    contentUrl: readString(record.contentUrl),
    description: readString(record.description),
    webpageUrl: readString(record.webpageUrl),
    project,
  };
}

function dedupeDatasourceObjects(datasources: Array<Record<string, unknown> | undefined>): Record<string, unknown>[] {
  const seen = new Set<string>();
  return datasources.filter((datasource): datasource is Record<string, unknown> => {
    if (!datasource) {
      return false;
    }

    const id = readString(datasource.id);
    const name = readString(datasource.name);
    const key = id ?? name;
    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function getKnownDatasourceNames(input: GetAdditionalContextInput): Set<string> {
  return new Set(
    input.dashboardContext.dataSources
      ?.map((datasource) => datasource.name.trim().toLowerCase())
      .filter(Boolean) ?? [],
  );
}

function hasDatasourceMatchingDashboardContext(datasources: unknown[], input: GetAdditionalContextInput): boolean {
  const knownNames = getKnownDatasourceNames(input);
  if (!knownNames.size) {
    return false;
  }

  return datasources.some((datasource) => {
    if (!datasource || typeof datasource !== "object") {
      return false;
    }

    const name = readString((datasource as Record<string, unknown>).name);
    return Boolean(name && knownNames.has(name.trim().toLowerCase()));
  });
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function tryParseJson(text: string): unknown {
  if (!text.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function findObjectsWithId(value: unknown): Array<{ id: string; name?: string }> {
  if (!value || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(findObjectsWithId);
  }

  const record = value as Record<string, unknown>;
  const direct =
    typeof record.id === "string"
      ? [
          {
            id: record.id,
            name: typeof record.name === "string" ? record.name : undefined,
          },
        ]
      : [];

  return [...direct, ...Object.values(record).flatMap(findObjectsWithId)];
}

function findFirstUuid(text: string): string | undefined {
  return text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
}

function escapeFilterValue(value: string): string {
  return value.replace(/[,&]/g, " ").trim();
}

function sanitizeDashboardContext(input: GetAdditionalContextInput["dashboardContext"]) {
  return {
    dashboardName: input.dashboardName,
    workbookName: input.workbookName,
    worksheetNames: input.worksheets.map((worksheet) => worksheet.name),
    filterFields: input.filters.map((filter) => filter.fieldName),
    parameterNames: input.parameters.map((parameter) => parameter.name),
    capturedAt: input.capturedAt,
  };
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}

