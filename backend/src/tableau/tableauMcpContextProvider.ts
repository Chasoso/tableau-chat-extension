import { createRequire } from "node:module";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { getTableauConnectedAppSecrets } from "../aws/secrets";
import { getConfig } from "../config";
import { logError, logInfo, logWarn, safeErrorDetails, safeHash } from "../logging";
import type { TableauAdditionalContext, TableauMcpToolResultSummary, TableauMcpToolSummary } from "../types/tableau";
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
      const toolSummaries = tools.map(toToolSummary);
      const toolQueue = selectInitialTools(tools, mcpConfig.allowedTools, input);
      const toolResults: TableauMcpToolResultSummary[] = [];
      const calledToolNames = new Set<string>();

      while (toolQueue.length > 0 && toolResults.length < Math.max(mcpConfig.maxToolCalls, 0)) {
        const selection = toolQueue.shift();
        if (!selection) {
          break;
        }

        if (selection.status === "skipped") {
          toolResults.push(selection);
          continue;
        }

        if (calledToolNames.has(selection.tool.name)) {
          continue;
        }

        try {
          const result = await client.callTool(
            {
              name: selection.tool.name,
              arguments: selection.arguments,
            },
            undefined,
            { timeout: mcpConfig.timeoutMs },
          );
          toolResults.push({
            toolName: selection.tool.name,
            status: "success",
            summary: summarizeToolResult(result),
          });
          logMcpToolResultDebug(selection.tool.name, result, mcpConfig.debugLogResults);
          calledToolNames.add(selection.tool.name);

          const followUp = buildFollowUpToolSelection(selection.tool.name, result, tools, calledToolNames, input);
          if (followUp) {
            toolQueue.unshift(followUp);
          }
        } catch (error) {
          logWarn("tableau.mcp.tool.failed", {
            toolName: selection.tool.name,
            ...safeErrorDetails(error),
          });
          toolResults.push({
            toolName: selection.tool.name,
            status: "failed",
            warning: "Tool call failed.",
          });
        }
      }

      logInfo("tableau.mcp.stdio.completed", {
        toolCount: toolSummaries.length,
        calledToolCount: toolResults.filter((result) => result.status === "success").length,
        failedToolCount: toolResults.filter((result) => result.status === "failed").length,
        selectedTools: toolResults.map((result) => result.toolName),
      });
      const extractedWorkbook = extractWorkbookFromToolResults(toolResults, input);
      const extractedDatasources = extractDatasourcesFromToolResults(toolResults);
      logInfo("tableau.mcp.workbook.extracted", {
        workbookNamePresent: Boolean(extractedWorkbook?.name),
        workbookNameHash: safeHash(extractedWorkbook?.name),
        workbookIdHash: safeHash(extractedWorkbook?.id),
      });

      return {
        provider: this.name,
        workbook: extractedWorkbook,
        datasources: extractedDatasources,
        metadata: {
          transport: "stdio",
          toolCount: toolSummaries.length,
          calledTools: toolResults.map((result) => result.toolName),
          workbookExtracted: Boolean(extractedWorkbook),
        },
        mcpTools: toolSummaries,
        mcpToolResults: toolResults,
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
    }
  | {
      status: "skipped";
      toolName: string;
      warning: string;
    };

function selectInitialTools(
  tools: McpTool[],
  allowedTools: string[],
  input: GetAdditionalContextInput,
): SelectedTool[] {
  const candidates = allowedTools.length ? tools.filter((tool) => allowedTools.includes(tool.name)) : getDefaultToolCandidates(tools, input);

  logInfo("tableau.mcp.tools.selected", {
    availableToolCount: tools.length,
    selectedTools: candidates.map((tool) => tool.name),
    allowedToolsConfigured: allowedTools.length > 0,
  });

  return candidates.map((tool) => {
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
  });
}

function getDefaultToolCandidates(tools: McpTool[], input: GetAdditionalContextInput): McpTool[] {
  const preferredNames = input.dashboardContext.workbookName
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
    .filter((tool) => /list.*workbook|list.*view|list.*datasource|search.*content/i.test(tool.name))
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
  if (toolName === "search-content") {
    return 50;
  }
  return 100;
}

function buildFollowUpToolSelection(
  completedToolName: string,
  result: unknown,
  tools: McpTool[],
  calledToolNames: Set<string>,
  input: GetAdditionalContextInput,
): SelectedTool | undefined {
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
    case "list-datasources":
      return { limit: 20 };
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
    textSnippet: sanitizeDebugText(text || JSON.stringify(result)).slice(0, 1800),
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

function sanitizeDebugText(value: string): string {
  return value
    .replace(/"token"\s*:\s*"[^"]*"/gi, '"token":"[REDACTED]"')
    .replace(/"secret[^"]*"\s*:\s*"[^"]*"/gi, '"secret":"[REDACTED]"')
    .replace(/"password"\s*:\s*"[^"]*"/gi, '"password":"[REDACTED]"')
    .replace(/"jwt"\s*:\s*"[^"]*"/gi, '"jwt":"[REDACTED]"')
    .replace(/"authorization"\s*:\s*"[^"]*"/gi, '"authorization":"[REDACTED]"');
}

function summarizeToolResult(result: unknown): string {
  const text = extractTextFromToolResult(result) || JSON.stringify(result);
  return text.length > 1200 ? `${text.slice(0, 1200)}...` : text;
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

function extractBestWorkbookId(result: unknown, preferredName: string | undefined): string | undefined {
  const text = extractTextFromToolResult(result);
  const parsed = tryParseJson(text) ?? result;
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

function extractWorkbookFromToolResults(
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

function extractDatasourcesFromToolResults(toolResults: TableauMcpToolResultSummary[]): unknown[] {
  return toolResults
    .filter((result) => result.status === "success" && result.summary && result.toolName === "list-datasources")
    .flatMap((result) => {
      const parsed = tryParseJson(result.summary ?? "");
      return parsed ? findDataSourceObjects(parsed) : [];
    });
}

type WorkbookCandidate = {
  id?: string;
  name: string;
  source: "workbook" | "view-workbook" | "workbookName";
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
  const direct = typeof record.name === "string" && (record.id || record.contentUrl || record.project) ? [record] : [];
  return [...direct, ...Object.values(record).flatMap(findDataSourceObjects)];
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
