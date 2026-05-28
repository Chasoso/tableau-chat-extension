export type WorksheetSummary = {
  name: string;
  sheetType?: string | null;
  summary?: string | null;
};

export type FilterSummary = {
  worksheetName?: string | null;
  fieldName: string;
  filterType?: string | null;
  appliedValues?: string[];
  isAllSelected?: boolean | null;
};

export type ParameterSummary = {
  name: string;
  currentValue?: string | number | boolean | null;
  dataType?: string | null;
  allowableValues?: string[];
};

export type SelectedMarkSummary = {
  worksheetName: string;
  columns?: string[];
  rowCount?: number;
  status?: "available" | "notAvailable";
};

export type DataSourceSummary = {
  worksheetName?: string | null;
  name: string;
  id?: string | null;
  fields?: string[] | null;
  fieldsAvailability?: "available" | "not_implemented" | "not_supported";
};

export type ContextAvailability = {
  workbookId: "available" | "not_implemented" | "not_supported";
  viewId: "available" | "not_implemented" | "not_supported";
  datasourceFields: "available" | "not_implemented" | "not_supported";
};

export type DashboardContext = {
  dashboardName: string;
  workbookName?: string | null;
  workbookId?: string | null;
  workbookContentUrl?: string | null;
  viewName?: string | null;
  viewId?: string | null;
  worksheets: WorksheetSummary[];
  filters: FilterSummary[];
  parameters: ParameterSummary[];
  selectedMarks?: SelectedMarkSummary[];
  dataSources?: DataSourceSummary[];
  availability?: ContextAvailability;
  contextSource?: "tableau-extension" | "mock";
  contextWarning?: string;
  capturedAt: string;
};

export type QuestionIntent =
  | "dashboard_explanation"
  | "filter_or_selection_state"
  | "metadata_lookup"
  | "data_analysis"
  | "content_search"
  | "how_to_use_tableau"
  | "unsupported";

export type McpObservation = {
  tool: string;
  purpose: string;
  argsSummary: Record<string, unknown>;
  success: boolean;
  resultSummary: string;
  rawResultPreview?: string;
  errorMessage?: string;
};

export type McpExecutionDebug = {
  intent: QuestionIntent;
  intentConfidence: number;
  answerableFromDashboardContext: boolean;
  needsMcp: boolean;
  maxToolCalls: number;
  plannerReasonBrief?: string;
  plannedTools: string[];
  blockedTools: string[];
  executedTools: string[];
  skippedTools: string[];
  toolCallCount: number;
  replanUsed: boolean;
  timingMs: {
    planning: number;
    execution: number;
  };
  fallbackReason?: string;
};

export type TableauAdditionalContext = {
  provider: "mock" | "direct-api" | "tableau-mcp";
  workbook?: unknown;
  datasources?: unknown[];
  metadata?: unknown;
  mcpTools?: TableauMcpToolSummary[];
  mcpToolResults?: TableauMcpToolResultSummary[];
  mcpObservations?: McpObservation[];
  mcpExecutionDebug?: McpExecutionDebug;
  warnings?: string[];
};

export type TableauMcpToolSummary = {
  name: string;
  description?: string;
};

export type TableauMcpToolResultSummary = {
  toolName: string;
  status: "success" | "skipped" | "failed";
  summary?: string;
  warning?: string;
};
