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
      const selectedTools = selectTools(tools, mcpConfig.allowedTools, mcpConfig.maxToolCalls, input);
      const toolResults: TableauMcpToolResultSummary[] = [];

      for (const selection of selectedTools) {
        if (selection.status === "skipped") {
          toolResults.push(selection);
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
      });

      return {
        provider: this.name,
        metadata: {
          transport: "stdio",
          toolCount: toolSummaries.length,
          calledTools: toolResults.map((result) => result.toolName),
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

function selectTools(
  tools: McpTool[],
  allowedTools: string[],
  maxToolCalls: number,
  input: GetAdditionalContextInput,
): SelectedTool[] {
  const candidates = allowedTools.length
    ? tools.filter((tool) => allowedTools.includes(tool.name))
    : tools.filter((tool) => /workbook|datasource|metadata|view|search|content/i.test(tool.name));

  return candidates.slice(0, Math.max(maxToolCalls, 0)).map((tool) => {
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

function inferToolArguments(tool: McpTool, input: GetAdditionalContextInput): Record<string, unknown> | undefined {
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
