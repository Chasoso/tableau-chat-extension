import type { ChatRequest } from "../types/chat";
import type { TableauAdditionalContext } from "../types/tableau";

const REDACTED_KEYS = /token|secret|password|jwt|authorization|credential|cookie/i;

export type CompressedDashboardContext = {
  dashboardName: string;
  workbookName: string;
  worksheets: string[];
  filters: string[];
  parameters: string[];
  dataSources: string[];
  provider: TableauAdditionalContext["provider"];
  workbookMetadata: string;
  additionalMetadata: string;
  mcpTools: string[];
  mcpToolResults: string[];
  warnings: string[];
};

export function compressDashboardContext(
  request: ChatRequest,
  additionalContext: TableauAdditionalContext,
): CompressedDashboardContext {
  const dashboardContext = request.dashboardContext;

  return {
    dashboardName: dashboardContext.dashboardName,
    workbookName: dashboardContext.workbookName ?? extractName(additionalContext.workbook) ?? "not available",
    worksheets: dashboardContext.worksheets.map((worksheet) => worksheet.name).filter(Boolean),
    filters: dashboardContext.filters.map((filter) => {
      const values = filter.appliedValues?.length ? filter.appliedValues.join(", ") : "not specified";
      return `${filter.worksheetName ? `${filter.worksheetName} / ` : ""}${filter.fieldName}: ${values}`;
    }),
    parameters: dashboardContext.parameters.map((parameter) => {
      const value = parameter.currentValue ?? "not specified";
      return `${parameter.name}: ${String(value)}`;
    }),
    dataSources: [
      ...(dashboardContext.dataSources?.map((datasource) => datasource.name) ?? []),
      ...extractDataSourceNames(additionalContext.datasources),
    ].filter(unique),
    provider: additionalContext.provider,
    workbookMetadata: safeJsonSnippet(additionalContext.workbook, 1600),
    additionalMetadata: safeJsonSnippet(additionalContext.metadata, 2400),
    mcpTools: additionalContext.mcpTools?.map((tool) => tool.name).slice(0, 20) ?? [],
    mcpToolResults:
      additionalContext.mcpToolResults?.map((result) => {
        const prefix = `${result.toolName}: ${result.status}`;
        return result.summary ? `${prefix} - ${result.summary}` : result.warning ? `${prefix} - ${result.warning}` : prefix;
      }) ?? [],
    warnings: additionalContext.warnings ?? [],
  };
}

export function renderCompressedContext(context: CompressedDashboardContext): string {
  return [
    `Dashboard: ${context.dashboardName}`,
    `Workbook: ${context.workbookName}`,
    `Worksheets: ${context.worksheets.join(", ") || "none"}`,
    `Filters: ${context.filters.join("; ") || "none"}`,
    `Parameters: ${context.parameters.join("; ") || "none"}`,
    `Data sources: ${context.dataSources.join(", ") || "not available"}`,
    `Additional context provider: ${context.provider}`,
    `Workbook metadata: ${context.workbookMetadata || "not available"}`,
    `Additional metadata: ${context.additionalMetadata || "not available"}`,
    `MCP tools: ${context.mcpTools.join(", ") || "not available"}`,
    `MCP tool results: ${context.mcpToolResults.join("\n") || "not available"}`,
    `Warnings: ${context.warnings.join("; ") || "none"}`,
  ].join("\n");
}

export function safeJsonSnippet(value: unknown, maxLength: number): string {
  if (value === undefined || value === null) {
    return "";
  }

  const text = JSON.stringify(redact(value));
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function redact(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(redact);
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key,
      REDACTED_KEYS.test(key) ? "[REDACTED]" : redact(child),
    ]),
  );
}

function extractName(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const name = (value as Record<string, unknown>).name;
  return typeof name === "string" && name.trim() ? name.trim() : undefined;
}

function extractDataSourceNames(datasources: unknown[] | undefined): string[] {
  if (!datasources?.length) {
    return [];
  }

  return datasources.flatMap((datasource) => findNamesByKey(datasource, "name")).filter(Boolean);
}

function findNamesByKey(value: unknown, key: string): string[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => findNamesByKey(item, key));
  }

  const record = value as Record<string, unknown>;
  const direct = typeof record[key] === "string" ? [record[key] as string] : [];
  return [...direct, ...Object.values(record).flatMap((item) => findNamesByKey(item, key))];
}

function unique(value: string, index: number, values: string[]): boolean {
  return value.trim().length > 0 && values.indexOf(value) === index;
}
