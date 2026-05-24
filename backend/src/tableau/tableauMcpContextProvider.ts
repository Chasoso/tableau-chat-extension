import { getConfig } from "../config";
import type { TableauAdditionalContext } from "../types/tableau";
import type { GetAdditionalContextInput, TableauContextProvider } from "./contextProvider";

type TableauMcpResponse = {
  workbook?: unknown;
  datasources?: unknown[];
  metadata?: unknown;
  warnings?: string[];
};

export class TableauMcpContextProvider implements TableauContextProvider {
  readonly name = "tableau-mcp" as const;

  async getAdditionalContext(input: GetAdditionalContextInput): Promise<TableauAdditionalContext> {
    const config = getConfig().tableau.mcp;

    if (!config.serverUrl) {
      return {
        provider: this.name,
        warnings: ["Tableau MCP server is not configured. Using dashboard context only."],
      };
    }

    if (config.transport !== "http") {
      return {
        provider: this.name,
        warnings: [`Tableau MCP transport '${config.transport}' is not implemented in this PoC.`],
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
          tableauSubject: input.tableauSubject,
        }),
        signal: AbortSignal.timeout(config.timeoutMs),
      });

      if (!response.ok) {
        return {
          provider: this.name,
          warnings: [`Tableau MCP lookup failed with status ${response.status}.`],
        };
      }

      const body = (await response.json()) as TableauMcpResponse;
      return {
        provider: this.name,
        workbook: body.workbook,
        datasources: body.datasources ?? [],
        metadata: body.metadata,
        warnings: body.warnings ?? [],
      };
    } catch {
      return {
        provider: this.name,
        warnings: ["Tableau MCP lookup failed. Using dashboard context only."],
      };
    }
  }
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

