import type { QuestionPeriod } from "../utils/questionPeriod";

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

export type TableauProjectRef = {
  type: "project";
  name: string;
  id?: string;
};

export type TableauWorkbookRef = {
  type: "workbook";
  name: string;
  id?: string;
  projectName?: string;
};

export type TableauViewRef = {
  type: "view";
  name: string;
  id?: string;
  workbookName?: string;
  workbookId?: string;
  projectName?: string;
};

export type TableauDatasourceRef = {
  type: "datasource";
  name: string;
  id?: string;
  luid?: string;
  contentUrl?: string;
  projectName?: string;
  workbookName?: string;
};

export type DatasourceFieldProfile = {
  datasourceName: string;
  fields: DatasourceFieldDetail[];
  fieldNames: string[];
  fieldCount: number;
  sourceTool: "get-datasource-metadata";
};

export type DatasourceFieldDetail = {
  name: string;
  dataType?: string;
  role?: string;
  semanticRole?: string;
  source: "datasourceModel" | "fieldGroups";
};

export type QueryDatasourceInsightRow = {
  label?: string;
  value: number | null;
};

export type QuestionMetricIntent =
  | "views"
  | "favorites"
  | "love"
  | "bookmarks"
  | "reactions"
  | "unknown";

export type QuestionInterpretation = {
  originalQuestion: string;
  investigationQuestion: string;
  datasourceName?: string;
  datasourceMentions: string[];
  metricIntent: QuestionMetricIntent;
  asksForRanking: boolean;
  topN: number;
  period?: QuestionPeriod;
};

export type QueryDatasourceInsight = {
  datasourceName: string;
  datasourceLuid?: string;
  dimensionField?: string;
  metricField: string;
  rowCount: number;
  rows: QueryDatasourceInsightRow[];
};

export type ResolvedDatasourceRef = {
  name: string;
  id?: string;
  luid?: string;
  contentUrl?: string;
  projectName?: string;
  workbookName?: string;
  matchConfidence: number;
  matchReason: string;
  source:
    | "dashboardContext"
    | "list-datasources"
    | "search-content"
    | "list-views"
    | "get-workbook"
    | "list-workbooks";
};

export type NormalizedTableauContext = {
  dashboard?: {
    name?: string;
  };
  workbook?: TableauWorkbookRef;
  project?: TableauProjectRef;
  views: TableauViewRef[];
  datasources: TableauDatasourceRef[];
  projects: TableauProjectRef[];
};

export type TableauAdditionalContext = {
  provider: "mock" | "direct-api" | "tableau-mcp";
  workbook?: unknown;
  datasources?: unknown[];
  datasourceFieldProfiles?: DatasourceFieldProfile[];
  queryInsights?: QueryDatasourceInsight[];
  normalizedContext?: NormalizedTableauContext;
  questionInterpretation?: QuestionInterpretation;
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
