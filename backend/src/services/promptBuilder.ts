import type { ChatRequest } from "../types/chat";
import type { TableauAdditionalContext } from "../types/tableau";

export function buildPrompt(request: ChatRequest, additionalContext: TableauAdditionalContext): string {
  const worksheetNames = request.dashboardContext.worksheets.map((worksheet) => worksheet.name).join(", ");
  const filters = request.dashboardContext.filters
    .map((filter) => `${filter.fieldName}: ${(filter.appliedValues ?? []).join(", ") || "not specified"}`)
    .join("; ");

  return [
    "You are a Tableau dashboard assistant.",
    "Answer using only the provided dashboard metadata and additional Tableau context.",
    "Do not infer confidential row-level details that were not provided.",
    `Question: ${request.question}`,
    `Dashboard: ${request.dashboardContext.dashboardName}`,
    `Workbook: ${request.dashboardContext.workbookName ?? "not available"}`,
    `Worksheets: ${worksheetNames || "none"}`,
    `Filters: ${filters || "none"}`,
    `Parameters: ${request.dashboardContext.parameters.map((parameter) => parameter.name).join(", ") || "none"}`,
    `Additional context provider: ${additionalContext.provider}`,
  ].join("\n");
}

